import { before, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { production } from "../src/production";
const origin = "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev";
const env: any = {
  APP_ENV: "production",
  PUBLIC_SITE_ORIGIN: origin,
  ACCESS_ISSUER: "https://bluefin-test.cloudflareaccess.com",
  ACCESS_AUD: "fixture",
  ADMIN_EMAILS: "owner@example.test",
  STRIPE_ACCOUNT_ID: "",
  STRIPE_SECRET_KEY: "sk_live_syntheticFixtureOnly",
  PORTAL_ENABLED: "false",
};
let jwt: string, adminKeys: any;
before(async () => {
  const pair = await generateKeyPair("RS256");
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = "fixture";
  adminKeys = createLocalJWKSet({ keys: [jwk] });
  jwt = await new SignJWT({ email: env.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(env.ACCESS_ISSUER)
    .setAudience(env.ACCESS_AUD)
    .setExpirationTime("5m")
    .sign(pair.privateKey);
});
function request(method = "GET", signed = true) {
  return new Request(origin + "/api/v1/admin/stripe-readiness", {
    method,
    headers: {
      Origin: origin,
      ...(signed ? { "Cf-Access-Jwt-Assertion": jwt } : {}),
    },
  });
}
function fixture(override?: (path: string) => Response | undefined) {
  const calls: string[] = [];
  const d: any = {
    now: () => 1800000000,
    adminKeys,
    fetch: async (url: string, options: RequestInit) => {
      assert.equal(options.method, undefined); // Diagnostics must never mutate Stripe.
      assert.equal(
        (options.headers as any)["Stripe-Version"],
        "2025-02-24.acacia",
      );
      const path = new URL(url).pathname;
      calls.push(path);
      const response = override?.(path);
      if (response) return response;
      if (path.endsWith("/account"))
        return Response.json({
          id: "acct_livefixture",
          country: "US",
          charges_enabled: true,
          company: {
            name: "Bluefin Tuna LLC",
            tax_id: "never_return_tax_identifier",
          },
          email: "never_return_email",
        });
      if (path.endsWith("/prices"))
        return Response.json({
          has_more: false,
          data: [
            {
              id: "price_fixture",
              unit_amount: 19900,
              currency: "usd",
              livemode: true,
              product: {
                id: "prod_fixture",
                name: "Audit",
                metadata: { private_note: "never_return_metadata" },
                tax_code: "txcd_fixture",
              },
            },
          ],
        });
      if (path.endsWith("/tax/settings"))
        return Response.json({
          status: "active",
          livemode: true,
          defaults: { tax_code: "txcd_fixture" },
          head_office: {
            address: {
              country: "US",
              state: "NM",
              line1: "never_return_address",
            },
          },
        });
      if (path.endsWith("/webhook_endpoints"))
        return Response.json({
          has_more: false,
          data: [
            {
              id: "we_fixture",
              url: origin + "/api/v1/stripe/webhook",
              secret: "never_return_webhook_secret",
            },
          ],
        });
      return Response.json({ has_more: false, data: [] });
    },
  };
  return { app: production(d), calls };
}
test("Live diagnostic requires signed allowed admin, live environment/key and read-only method", async () => {
  const { app, calls } = fixture();
  assert.equal((await app.fetch(request("GET", false), env)).status, 401);
  assert.equal((await app.fetch(request("POST"), env)).status, 405);
  assert.equal(
    (
      await app.fetch(request(), {
        ...env,
        STRIPE_SECRET_KEY: "sk_test_fixture",
      })
    ).status,
    503,
  );
  assert.equal(
    (await app.fetch(request(), { ...env, APP_ENV: "test" })).status,
    503,
  );
  assert.equal(calls.length, 0);
});
test("Live diagnostic pins Acacia, redacts provider objects and does not imply payment readiness", async () => {
  const { app, calls } = fixture();
  const r = await app.fetch(request(), env);
  assert.equal(r.status, 200);
  const body: any = await r.json();
  assert.equal(body.account.id, "acct_livefixture");
  assert.equal(body.account.configuredAccountMatches, null);
  assert.equal(body.checkoutEnabled, false);
  assert.equal(body.webhookSecretConfigured, false);
  assert.equal(body.prices.data[0].unit_amount, 19900);
  assert.equal(body.registrations.result, "PASS");
  assert.deepEqual(body.registrations.data, []);
  assert.doesNotMatch(JSON.stringify(body), /never_return|sk_live|Bearer/);
  assert.equal(calls.length, 6);
});
test("Live diagnostic distinguishes provider permission failures, incomplete pagination and merchant mismatch", async () => {
  const { app } = fixture((path) =>
    path.endsWith("/tax/registrations")
      ? new Response("forbidden", { status: 403 })
      : path.endsWith("/prices")
        ? Response.json({ data: [], has_more: true })
        : undefined,
  );
  const body: any = await (await app.fetch(request(), env)).json();
  assert.equal(body.registrations.result, "FAIL");
  assert.equal(body.registrations.error, "stripe_read_http_403");
  assert.equal(body.prices.error, "stripe_inventory_incomplete");
  assert.equal(
    (await app.fetch(request(), { ...env, STRIPE_ACCOUNT_ID: "acct_other" }))
      .status,
    503,
  );
});
