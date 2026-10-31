import { before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { production } from "../src/production";
import { LIVE_ACCOUNT_ID } from "../src/live-catalog";
import { LIVE_WEBHOOK_EVENTS } from "../src/live-webhook-setup";
const origin = "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev",
  now = 1800000000;
let env: any,
  jwt: string,
  deps: any,
  endpoint: any,
  products: any[],
  prices: any[],
  writes: string[],
  denied: string;
before(async () => {
  const k = await generateKeyPair("RS256"),
    j = await exportJWK(k.publicKey);
  j.kid = "fixture";
  env = {
    APP_ENV: "production",
    PUBLIC_SITE_ORIGIN: origin,
    STRIPE_ACCOUNT_ID: LIVE_ACCOUNT_ID,
    STRIPE_SECRET_KEY: "rk_live_SYNTHETICONLY",
    ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    ACCESS_AUD: "fixture",
    ADMIN_EMAILS: "owner@example.test",
    LIVE_MAINTENANCE_UNTIL: String(now + 600),
  };
  jwt = await new SignJWT({ email: env.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: j.kid })
    .setIssuer(env.ACCESS_ISSUER)
    .setAudience(env.ACCESS_AUD)
    .setExpirationTime("20m")
    .sign(k.privateKey);
  deps = {
    now: () => now,
    adminKeys: createLocalJWKSet({ keys: [j] }),
    fetch: async (u: string, o: any = {}) => {
      assert.equal(o.headers["Stripe-Version"], "2025-02-24.acacia");
      const path = new URL(u).pathname.slice(4),
        b = new URLSearchParams(o.body);
      if (o.method === "POST") {
        writes.push(path);
        if (denied === path)
          return new Response("private provider error", { status: 403 });
      }
      if (path === "account") return Response.json({ id: LIVE_ACCOUNT_ID });
      if (path.startsWith("webhook_endpoints/")) {
        if (o.method === "POST") {
          assert.equal(
            [...b.keys()].every((x) => x.startsWith("enabled_events[")),
            true,
          );
          endpoint.enabled_events = [...b.values()];
        }
        return Response.json({ ...endpoint, secret: "whsec_MUSTNOTRETURN" });
      }
      if (path === "products") {
        if (o.method === "POST") {
          assert.equal(
            o.headers["Idempotency-Key"],
            "bluefin-live-product-EXTRA-50-UPDATE-R",
          );
          const p = {
            id: "prod_fixture",
            name: b.get("name"),
            metadata: { sku: b.get("metadata[sku]") },
            active: true,
            livemode: true,
          };
          products.push(p);
          return Response.json(p);
        }
        return Response.json({ data: products, has_more: false });
      }
      if (path === "prices") {
        if (o.method === "POST") {
          assert.equal(
            o.headers["Idempotency-Key"],
            "bluefin-live-price-EXTRA-50-UPDATE-R",
          );
          const p = {
            id: "price_fixture",
            product: b.get("product"),
            unit_amount: Number(b.get("unit_amount")),
            currency: b.get("currency"),
            lookup_key: b.get("lookup_key"),
            active: true,
            livemode: true,
            type: "one_time",
          };
          prices.push(p);
          return Response.json(p);
        }
        return Response.json({ data: prices, has_more: false });
      }
      throw Error("Unexpected provider request");
    },
  };
});
beforeEach(() => {
  products = [];
  prices = [];
  writes = [];
  denied = "";
  endpoint = {
    id: "we_1UWTAyBzdKYgwVw6TrMDvijt",
    url: origin + "/api/v1/stripe/webhook",
    livemode: true,
    status: "enabled",
    api_version: "2025-02-24.acacia",
    enabled_events: [...LIVE_WEBHOOK_EVENTS],
  };
});
function req(action = "refund-webhook", auth = true, source = origin) {
  return new Request(origin + "/api/v1/admin/stripe-maintenance", {
    method: "POST",
    headers: {
      Origin: source,
      "Content-Type": "application/json",
      ...(auth ? { "Cf-Access-Jwt-Assertion": jwt } : {}),
    },
    body: JSON.stringify({ action }),
  });
}
test("Live maintenance requires bounded window, signed admin, origin and exact merchant", async () => {
  const a = production(deps);
  assert.equal(
    (await a.fetch(req(), { ...env, LIVE_MAINTENANCE_UNTIL: undefined }))
      .status,
    404,
  );
  assert.equal((await a.fetch(req("refund-webhook", false), env)).status, 401);
  assert.equal(
    (
      await a.fetch(
        req("refund-webhook", true, "https://elsewhere.example"),
        env,
      )
    ).status,
    403,
  );
  assert.equal((await a.fetch(req("arbitrary-action"), env)).status, 400);
  assert.equal(
    (await a.fetch(req(), { ...env, STRIPE_ACCOUNT_ID: "acct_other" })).status,
    503,
  );
  assert.equal(writes.length, 0);
});
test("Live refund subscription preserves existing events, secret, destination and API version; repeat is read-only", async () => {
  const a = production(deps);
  endpoint.enabled_events.push("invoice.paid");
  const r = await a.fetch(req(), env);
  assert.equal(r.status, 200);
  assert.doesNotMatch(await r.text(), /whsec_|rk_live_/);
  assert.equal(endpoint.enabled_events.includes("invoice.paid"), true);
  assert.equal(endpoint.enabled_events.includes("charge.refunded"), true);
  assert.equal((await a.fetch(req(), env)).status, 200);
  assert.equal(writes.length, 1);
  endpoint.url = "https://elsewhere.example";
  assert.equal((await a.fetch(req(), env)).status, 409);
  assert.equal(writes.length, 1);
});
test("Only the missing approved $150 Live addon is created; interrupted Price setup resumes without duplicate Product", async () => {
  const a = production(deps);
  denied = "prices";
  let r = await a.fetch(req("missing-update-addon"), env);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: "stripe_write_http_403" });
  assert.equal(products.length, 1);
  assert.equal(prices.length, 0);
  denied = "";
  r = await a.fetch(req("missing-update-addon"), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    action: "missing-update-addon",
    sku: "EXTRA-50-UPDATE-R",
    product: "prod_fixture",
    price: "price_fixture",
    amount: 15000,
    currency: "usd",
    verified: true,
  });
  const n = writes.length;
  assert.equal((await a.fetch(req("missing-update-addon"), env)).status, 200);
  assert.equal(writes.length, n);
  assert.equal(products.length, 1);
  prices[0].unit_amount = 100;
  assert.equal((await a.fetch(req("missing-update-addon"), env)).status, 409);
  assert.equal(writes.length, n);
});
test("Existing untagged product, duplicate or orphan lookup key requires mapping; never creates replacement", async () => {
  const a = production(deps);
  products = [
    {
      name: "Additional 50 Activities — Update With MH & Cost",
      active: true,
      livemode: true,
    },
  ];
  assert.equal((await a.fetch(req("missing-update-addon"), env)).status, 409);
  products = [];
  prices = [{ lookup_key: "EXTRA-50-UPDATE-R" }];
  assert.equal((await a.fetch(req("missing-update-addon"), env)).status, 409);
  assert.equal(writes.length, 0);
});
