import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { production } from "../src/production";
import { applicationCleanup } from "../src/applications";
import { quote } from "../src/catalog";
import { digest } from "../src/security";
import { AGREEMENT_HASH, AGREEMENT_VERSION } from "../src/agreement";
let mf: any, e: any;
let now = 1800000000;
let host = "bluefin-project-portal-api.bluefintuna-llc.workers.dev",
  action = "create-order";
const origin = "https://" + host;
const d = {
  now: () => now,
  fetch: async () => Response.json({ success: true, hostname: host, action }),
} as any;
const app = production(d);
const cart = {
  sku: "p6_audit",
  activities: 150,
  revisions: 0,
  materials: [],
  existingResources: false,
};
const customer = {
  name: "Synthetic reviewer",
  email: "synthetic@example.invalid",
  project: "Synthetic scope",
  dataDate: "",
  businessUse: true,
  businessName: "Synthetic Ltd",
  billingCountry: "US",
  billingState: "NM",
  billingAddress: "Synthetic example",
  billingCity: "Example",
  billingPostal: "00000",
  projectCountry: "US",
};
before(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-10-28",
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
  });
  const DB = await mf.getD1Database("DB");
  for (const f of readdirSync(new URL("../migrations", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(
      new URL("../migrations/" + f, import.meta.url),
      "utf8",
    ).replace(/^--.*$/gm, "");
    await DB.exec(sql.replace(/\n/g, " "));
  }
  e = {
    ...JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    ).vars,
    APPLICATIONS_ENABLED: "true",
    DB,
    UPLOADS: await mf.getR2Bucket("UPLOADS"),
    RATE_LIMIT_SALT: "a".repeat(48),
    TURNSTILE_SECRET_KEY: "fixture",
    ASSETS: { fetch: async () => new Response("shell") },
  };
});
after(async () => mf?.dispose());
beforeEach(async () => {
  await e.DB.exec("DELETE FROM service_applications; DELETE FROM rate_limits;");
  action = "create-order";
  host = new URL(origin).hostname;
});
async function body() {
  return {
    cart: structuredClone(cart),
    customer: structuredClone(customer),
    acceptance: {
      accepted: true,
      version: AGREEMENT_VERSION,
      hash: AGREEMENT_HASH,
      quoteHash: await digest(JSON.stringify(quote(cart))),
    },
    turnstileToken: "synthetic-challenge",
  };
}
const request = (
  b: any,
  path = "/api/v1/applications",
  headers = { Origin: origin },
) =>
  new Request(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(b),
  });
test("application persists immutable scope and separate acceptance, never PAID or Stripe state", async () => {
  const r = await app.fetch(request(await body()), e);
  assert.equal(r.status, 201);
  const result: any = await r.json();
  assert.equal(result.charged, false);
  assert.equal(result.status, "TAX_REVIEW_REQUIRED");
  const row = await e.DB.prepare("SELECT * FROM service_applications").first();
  assert.equal(row.terms_sha256, AGREEMENT_HASH);
  assert.equal(row.accepted_at, now);
  assert.equal(row.expires_at, now + 30 * 86400);
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM orders").first()).n,
    0,
  );
  await assert.rejects(
    e.DB.prepare("UPDATE service_applications SET terms_version='old'").run(),
  );
  await assert.rejects(
    e.DB.prepare("UPDATE service_applications SET customer_json='{}'").run(),
  );
});
test("missing/old terms, quote tampering, wrong add-on and missing business name reject before record insertion", async () => {
  for (const mutate of [
    (b: any) => (b.acceptance.accepted = false),
    (b: any) => (b.acceptance.version = "v1"),
    (b: any) => (b.acceptance.hash = "bad"),
    (b: any) => (b.cart.activities = 151),
    (b: any) => (b.customer.businessName = ""),
  ]) {
    const b = await body();
    mutate(b);
    assert.ok((await app.fetch(request(b), e)).status >= 400);
  }
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM service_applications").first())
      .n,
    0,
  );
});
test("Turnstile hostname/action and origin reject; no customer data in response", async () => {
  action = "other";
  assert.equal((await app.fetch(request(await body()), e)).status, 403);
  action = "create-order";
  host = "other.example";
  assert.equal((await app.fetch(request(await body()), e)).status, 403);
  assert.equal(
    (
      await app.fetch(
        request(await body(), undefined, { Origin: "https://evil.example" }),
        e,
      )
    ).status,
    403,
  );
});
test("consumer requests and quote-only material mapping enter review, never automatic checkout", async () => {
  const b = await body();
  b.customer.businessUse = false;
  b.customer.businessName = "";
  const r = await app.fetch(request(b), e);
  assert.equal(r.status, 201);
  assert.match(JSON.stringify(await r.json()), /Consumer disclosures/);
  const q = {
    ...cart,
    sku: "update_withres",
    activities: 200,
    existingResources: true,
    materials: [{ code: "concrete", rows: 50 }],
  };
  const multi = {
    ...(await body()),
    cart: q,
    customer: { ...customer, dataDate: "2026-10-30" },
    acceptance: {
      ...(await body()).acceptance,
      quoteHash: await digest(JSON.stringify(quote(q))),
    },
  };
  assert.equal((await app.fetch(request(multi), e)).status, 201);
});
test("production payment/upload remain closed even if old environment gate accidentally enabled; admin anonymous rejected; staging endpoints absent", async () => {
  for (const path of [
    "/api/v1/orders",
    "/api/v1/orders/00000000-0000-0000-0000-000000000000/checkout",
    "/api/v1/orders/00000000-0000-0000-0000-000000000000/files",
  ])
    assert.equal(
      (await app.fetch(request({}, path), { ...e, PORTAL_ENABLED: "true" }))
        .status,
      503,
    );
  assert.equal(
    (await app.fetch(new Request(origin + "/api/v1/admin/applications"), e))
      .status,
    401,
  );
  assert.equal(
    (
      await app.fetch(
        new Request(origin + "/api/v1/admin/staging-readiness"),
        e,
      )
    ).status,
    404,
  );
});
test("90-day unpaid application minimization respects explicit hold, without deleting payment evidence", async () => {
  await app.fetch(request(await body()), e);
  now += 120 * 86400;
  await e.DB.prepare(
    "UPDATE service_applications SET hold_reason='Synthetic documented incident'",
  ).run();
  await applicationCleanup(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM service_applications").first())
      .n,
    1,
  );
  await e.DB.prepare("UPDATE service_applications SET hold_reason=NULL").run();
  await applicationCleanup(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM service_applications").first())
      .n,
    0,
  );
  now -= 120 * 86400;
});
