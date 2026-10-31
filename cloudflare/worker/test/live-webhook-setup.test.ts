import { before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { production } from "../src/production";
import { LIVE_WEBHOOK_EVENTS } from "../src/live-webhook-setup";
import { LIVE_ACCOUNT_ID, livePrices } from "../src/live-catalog";
import { quote, packages } from "../src/catalog";
const origin = "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev";
const now = 1800000000;
let env: any,
  jwt: string,
  deps: any,
  rsa: CryptoKeyPair,
  endpoint: any,
  posts: URLSearchParams[],
  calls: number;
before(async () => {
  const auth = await generateKeyPair("RS256"),
    jwk = await exportJWK(auth.publicKey);
  jwk.kid = "fixture";
  rsa = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  env = {
    APP_ENV: "production",
    PUBLIC_SITE_ORIGIN: origin,
    ACCESS_ISSUER: "https://bluefin-test.cloudflareaccess.com",
    ACCESS_AUD: "fixture",
    ADMIN_EMAILS: "owner@example.test",
    STRIPE_SECRET_KEY: "rk_live_SYNTHETICONLY",
    STRIPE_ACCOUNT_ID: LIVE_ACCOUNT_ID,
    LIVE_WEBHOOK_SETUP_ID: "11111111-1111-4111-8111-111111111111",
    LIVE_WEBHOOK_SETUP_EXPIRES: String(now + 600),
    LIVE_WEBHOOK_SETUP_PUBLIC_JWK: JSON.stringify(
      await crypto.subtle.exportKey("jwk", rsa.publicKey),
    ),
  };
  jwt = await new SignJWT({ email: env.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(env.ACCESS_ISSUER)
    .setAudience(env.ACCESS_AUD)
    .setExpirationTime("10m")
    .sign(auth.privateKey);
  deps = {
    now: () => now,
    adminKeys: createLocalJWKSet({ keys: [jwk] }),
    fetch: async (url: string, options: any = {}) => {
      calls++;
      if (url.endsWith("/account"))
        return Response.json({ id: LIVE_ACCOUNT_ID, charges_enabled: true });
      if (url.includes("webhook_endpoints?"))
        return Response.json({
          has_more: false,
          data: endpoint ? [endpoint] : [],
        });
      assert.equal(url, "https://api.stripe.com/v1/webhook_endpoints");
      assert.equal(options.method, "POST");
      assert.equal(
        options.headers["Idempotency-Key"],
        "bluefin-live-" + env.LIVE_WEBHOOK_SETUP_ID,
      );
      posts.push(new URLSearchParams(options.body));
      endpoint ||= {
        id: "we_fixture",
        url: origin + "/api/v1/stripe/webhook",
        livemode: true,
        status: "enabled",
        api_version: "2025-02-24.acacia",
        enabled_events: LIVE_WEBHOOK_EVENTS,
        secret: "whsec_SYNTHETICONLY",
        metadata: { setup: "bluefin-live-" + env.LIVE_WEBHOOK_SETUP_ID },
      };
      return Response.json(endpoint);
    },
  };
});
beforeEach(() => {
  endpoint = null;
  posts = [];
  calls = 0;
});
function req(body: unknown = {}, signed = true, source = origin) {
  return new Request(origin + "/api/v1/admin/stripe-webhook-setup", {
    method: "POST",
    headers: {
      Origin: source,
      "Content-Type": "application/json",
      ...(signed ? { "Cf-Access-Jwt-Assertion": jwt } : {}),
    },
    body: JSON.stringify(body),
  });
}
test("Live webhook setup requires admin, origin, short window and server-pinned encryption key", async () => {
  const app = production(deps);
  assert.equal((await app.fetch(req({}, false), env)).status, 401);
  assert.equal(
    (await app.fetch(req({}, true, "https://other.example"), env)).status,
    403,
  );
  assert.equal(
    (
      await app.fetch(req(), {
        ...env,
        LIVE_WEBHOOK_SETUP_EXPIRES: String(now),
      })
    ).status,
    404,
  );
  assert.equal(
    (await app.fetch(req({ publicKey: "attacker" }), env)).status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await app.fetch(req(), { ...env, STRIPE_ACCOUNT_ID: "acct_other" }))
      .status,
    503,
  );
  assert.equal(posts.length, 0);
});
test("Live webhook setup seals the secret, pins destination/events and replays idempotently", async () => {
  const app = production(deps);
  for (let i = 0; i < 2; i++) {
    const response = await app.fetch(req(), env);
    assert.equal(response.status, 200);
    const result: any = await response.json();
    assert.equal(result.endpoint, "we_fixture");
    assert.doesNotMatch(JSON.stringify(result), /whsec_|rk_live_/);
    const label = new TextEncoder().encode(
      `bluefin:${LIVE_ACCOUNT_ID}:we_fixture:${env.LIVE_WEBHOOK_SETUP_ID}`,
    );
    const plain = await crypto.subtle.decrypt(
      { name: "RSA-OAEP", label },
      rsa.privateKey,
      Uint8Array.from(atob(result.encryptedSecret), (x) => x.charCodeAt(0)),
    );
    assert.equal(new TextDecoder().decode(plain), "whsec_SYNTHETICONLY");
  }
  assert.equal(posts[0].toString(), posts[1].toString());
  assert.equal(posts[0].get("url"), origin + "/api/v1/stripe/webhook");
  assert.equal(posts[0].get("api_version"), "2025-02-24.acacia");
  assert.equal(posts[0].get("enabled_events[4]"), null);
});
test("Live webhook setup refuses duplicate/foreign existing endpoints and preserves configured secret", async () => {
  const app = production(deps);
  endpoint = {
    id: "we_existing",
    url: origin + "/api/v1/stripe/webhook",
    livemode: true,
    status: "enabled",
    enabled_events: LIVE_WEBHOOK_EVENTS,
    metadata: {},
  };
  assert.equal((await app.fetch(req(), env)).status, 409);
  const r = await app.fetch(req(), {
    ...env,
    STRIPE_WEBHOOK_SECRET: "whsec_existing",
  });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any).configured, true);
  assert.equal(posts.length, 0);
});
test("Live catalog maps the seven real packages and 21 verified prices without inventing the missing Update addon", () => {
  assert.equal(Object.keys(livePrices).length, 21);
  for (const p of packages) {
    assert.ok(livePrices[p.sku]);
    assert.ok(
      quote({
        sku: p.sku,
        activities: p.activities,
        revisions: 0,
        materials: [],
        existingResources: p.sku === "update_withres",
      }).total > 0,
    );
  }
  assert.equal(livePrices["EXTRA-50-UPDATE-R"], undefined);
  assert.equal(new Set(Object.values(livePrices).map((x) => x.price)).size, 21);
});
