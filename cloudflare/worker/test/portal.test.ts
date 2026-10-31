import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { app } from "../src/index";
import { quote, packages, TTL, TERMS, MAX_FILE } from "../src/catalog";
import { signature, digest, ready } from "../src/security";
import { cleanup, notify } from "../src/cleanup";
let mf: any,
  e: any,
  clock = 1800000000,
  sessions: any = {},
  stripeCalls: any[] = [],
  telegramCalls = 0;
const site = "https://bluefintuna.life";
const cart = (sku = "p6_audit", activities = 150, extras = {}) => ({
  sku,
  activities,
  revisions: 0,
  materials: [],
  existingResources: false,
  ...extras,
});
const fakeFetch = async (url: any, opt: any = {}) => {
  if (String(url).includes("siteverify"))
    return Response.json({
      success: true,
      hostname: "bluefintuna.life",
      action: "create-order",
    });
  if (String(url).includes("telegram")) {
    telegramCalls++;
    return Response.json({ ok: true });
  }
  if (String(url).endsWith("/tax/settings"))
    return Response.json({ status: "active", livemode: false });
  if (String(url).endsWith("/account"))
    return Response.json({ id: "acct_test" });
  if (String(url).includes("/prices?")) {
    const sku = new URL(String(url)).searchParams.get("lookup_keys[]")!;
    const amount =
      packages.find((p) => p.sku === sku)?.cents ??
      (sku === "REVISION"
        ? 9900
        : sku === "EXTRA-50-NR"
          ? 10000
          : sku === "EXTRA-50-BASE-R"
            ? 17500
            : sku === "EXTRA-50-UPDATE-R"
              ? 15000
              : sku.startsWith("BASELINE-MAT-")
                ? 24900
                : 11900);
    return Response.json({
      has_more: false,
      data: [
        {
          id: "price_fixture_" + amount,
          lookup_key: sku,
          unit_amount: amount,
          currency: "usd",
          active: true,
          type: "one_time",
          livemode: false,
          tax_behavior: "exclusive",
          product: {
            id: "prod_fixture",
            active: true,
            livemode: false,
            tax_code: "txcd_20060048",
          },
        },
      ],
    });
  }
  if (String(url).endsWith("/checkout/sessions")) {
    const b = new URLSearchParams(opt.body);
    stripeCalls.push(b);
    const oid = b.get("client_reference_id");
    const total = [...b.keys()]
      .filter((k) => k.endsWith("[price]"))
      .reduce(
        (s, k) =>
          s +
          Number(b.get(k)!.replace("price_fixture_", "")) *
            Number(b.get(k.replace("[price]", "[quantity]"))),
        0,
      );
    const s = {
      id: "cs_test_" + oid,
      url: "https://checkout.stripe.com/c/pay/" + oid,
      client_reference_id: oid,
      metadata: {
        order_id: oid,
        quote_hash: b.get("metadata[quote_hash]"),
        agreement_version: b.get("metadata[agreement_version]"),
        agreement_sha256: b.get("metadata[agreement_sha256]"),
      },
      consent_collection: {
        terms_of_service: b.get("consent_collection[terms_of_service]"),
      },
      automatic_tax: {
        enabled: b.get("automatic_tax[enabled]") === "true",
        status: null,
      },
      billing_address_collection: b.get("billing_address_collection"),
      tax_id_collection: {
        enabled: b.get("tax_id_collection[enabled]") === "true",
        required: b.get("tax_id_collection[required]"),
      },
      currency: "usd",
      amount_subtotal: total,
      amount_total: total,
      total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
      expires_at: Number(b.get("expires_at")),
      status: "open",
      payment_status: "unpaid",
      livemode: false,
    };
    sessions[s.id] = s;
    return Response.json(s);
  }
  const sid = new URL(String(url)).pathname.split("/").pop();
  const session = sessions[sid!];
  if (session?.payment_status === "paid" && !("consent" in session))
    session.consent = { terms_of_service: "accepted" };
  return Response.json(session || {});
};
const d: any = { now: () => clock, fetch: fakeFetch };
const api = (
  path: string,
  method = "GET",
  body?: any,
  t?: string,
  extra = {},
) =>
  app(d).fetch(
    new Request("https://api.example" + path, {
      method,
      headers: {
        origin: site,
        ...(t ? { authorization: "Bearer " + t } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    e,
  );
async function create(c = cart()) {
  const r = await api("/api/v1/orders", "POST", {
    cart: c,
    customer: {
      name: "Test Buyer",
      email: "test@example.com",
      project: "Synthetic test",
      dataDate: "2026-10-28",
    },
    turnstileToken: "test",
  });
  assert.equal(r.status, 201, await r.clone().text());
  return r.json() as Promise<any>;
}
async function file(
  o: any,
  category = "xer",
  name = "test.xer",
  content = "ERMHDR\t20\tfixture",
  mime = "text/plain",
) {
  return app(d).fetch(
    new Request(`https://api.example/api/v1/orders/${o.orderId}/files`, {
      method: "POST",
      headers: {
        origin: site,
        authorization: "Bearer " + o.token,
        "content-type": mime,
        "x-file-name": encodeURIComponent(name),
        "x-file-category": category,
      },
      body: content,
    }),
    e,
  );
}
async function pay(o: any) {
  assert.equal((await file(o)).status, 201);
  const q = (await (
    await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
  ).json()) as any;
  const r = await api(
    `/api/v1/orders/${o.orderId}/checkout`,
    "POST",
    { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
    o.token,
  );
  assert.equal(r.status, 200, await r.clone().text());
  return sessions["cs_test_" + o.orderId];
}
async function signed(event: any, t = clock) {
  const raw = JSON.stringify(event);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(e.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(t + "." + raw),
    ),
  ).toString("hex");
  return app(d).fetch(
    new Request("https://api.example/api/v1/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": `t=${t},v1=${sig}` },
      body: raw,
    }),
    e,
  );
}
before(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-04-01",
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
  });
  e = {
    DB: await mf.getD1Database("DB"),
    UPLOADS: await mf.getR2Bucket("UPLOADS"),
    APP_ENV: "test",
    PORTAL_ENABLED: "true",
    LEGAL_APPROVED: "true",
    PUBLIC_SITE_ORIGIN: site,
    ALLOWED_ORIGINS: site,
    ACCESS_ISSUER: "https://example.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ADMIN_EMAILS: "operator@example.com",
    STRIPE_SECRET_KEY: "sk_test_FAKE00000000",
    STRIPE_WEBHOOK_SECRET: "whsec_FAKE00000000",
    STRIPE_ACCOUNT_ID: "acct_test",
    TURNSTILE_SECRET_KEY: "fake",
    RATE_LIMIT_SALT: "a".repeat(32),
    TAX_MODE: "owner_reviewed_manual",
    INVOICE_CREATION: "false",
  };
  for (const name of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(
      new URL("../migrations/" + name, import.meta.url),
      "utf8",
    );
    await e.DB.exec(sql.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  }
});
after(async () => {
  await mf.dispose();
});
beforeEach(async () => {
  clock = 1800000000;
  sessions = {};
  stripeCalls = [];
  telegramCalls = 0;
  for (const table of [
    "payment_tax_evidence",
    "checkout_tax_requirements",
    "notifications",
    "payment_events",
    "agreement_acceptances",
    "audit_events",
    "order_files",
    "orders",
    "rate_limits",
    "housekeeping",
  ])
    await e.DB.prepare(`DELETE FROM ${table}`).run();
  const list = await e.UPLOADS.list();
  for (const o of list.objects) await e.UPLOADS.delete(o.key);
  e.INVOICE_CREATION = "false";
  e.TAX_MODE = "owner_reviewed_manual";
  d.fetch = fakeFetch;
  delete e.TELEGRAM_BOT_TOKEN;
  delete e.TELEGRAM_CHAT_ID;
});
test("seven exact base prices and activity rounding / caps", () => {
  assert.deepEqual(
    packages.map((p) => p.cents),
    [19900, 49900, 79900, 99900, 149900, 39900, 64900],
  );
  assert.equal(quote(cart("baseline_basic_nores", 76)).total, 59900);
  assert.equal(quote(cart("baseline_basic_withres", 126)).total, 114900);
  assert.equal(
    quote(cart("update_withres", 201, { existingResources: true })).total,
    79900,
  );
  assert.equal(quote(cart("baseline_basic_nores", 176)).scopeReview.length, 1);
  assert.equal(quote(cart("update_nores", 401)).scopeReview.length, 1);
  assert.equal(quote(cart("p6_audit", 151)).scopeReview.length, 1);
});
test("incompatible addons, extra fields, duplicates rejected; update materials reviewed", () => {
  assert.throws(() => quote({ ...cart(), price: 1 }));
  assert.throws(() => quote(cart("p6_audit", 150, { revisions: 1 })));
  assert.throws(() =>
    quote(
      cart("baseline_basic_nores", 75, {
        materials: [{ code: "concrete", rows: 1 }],
      }),
    ),
  );
  assert.throws(() =>
    quote(
      cart("baseline_basic_withres", 75, {
        materials: [
          { code: "rebar", rows: 1 },
          { code: "rebar", rows: 2 },
        ],
      }),
    ),
  );
  assert.equal(
    quote(
      cart("baseline_basic_withres", 75, {
        materials: [{ code: "concrete", rows: 50 }],
      }),
    ).total,
    104800,
  );
  assert.ok(
    quote(
      cart("baseline_basic_withres", 75, {
        materials: [{ code: "concrete", rows: 51 }],
      }),
    ).scopeReview.length,
  );
  assert.ok(
    quote(
      cart("update_withres", 200, {
        existingResources: true,
        materials: [{ code: "concrete", rows: 20 }],
      }),
    ).scopeReview.length,
  );
});
test("development/production missing approvals fail closed", async () => {
  assert.equal(
    ready({ ...e, STRIPE_SECRET_KEY: "rk_test_SYNTHETIC0000" }),
    true,
  );
  assert.equal(
    ready({ ...e, STRIPE_SECRET_KEY: "pk_test_SYNTHETIC0000" }),
    false,
  );
  assert.equal(
    ready({ ...e, STRIPE_SECRET_KEY: "rk_live_SYNTHETIC0000" }),
    false,
  );
  assert.equal(
    ready({
      ...e,
      APP_ENV: "production",
      STRIPE_SECRET_KEY: "rk_live_SYNTHETIC0000",
    }),
    true,
  );
  assert.equal(
    ready({
      ...e,
      APP_ENV: "production",
      STRIPE_SECRET_KEY: "rk_live_SYNTHETIC0000",
      PORTAL_ENABLED: "false",
    }),
    false,
  );
  assert.equal(ready({ ...e, APP_ENV: "development" }), false);
  assert.equal(ready({ ...e, APP_ENV: "production" }), false);
  assert.equal(ready({ ...e, ACCESS_AUD: "" }), false);
  const r = await app(d).fetch(
    new Request("https://api.example/api/v1/orders", {
      method: "POST",
      headers: { origin: site },
    }),
    { ...e, APP_ENV: "development" },
  );
  assert.equal(r.status, 503);
});
test("origin, capability and admin authorization isolation", async () => {
  const a = await create(),
    b = await create();
  assert.equal(
    (await api(`/api/v1/orders/${a.orderId}/files`, "GET", undefined, b.token))
      .status,
    404,
  );
  assert.equal((await api(`/api/v1/orders/${a.orderId}/status`)).status, 401);
  assert.equal(
    (
      await api("/api/v1/orders", "POST", {}, undefined, {
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal((await api("/api/v1/admin/orders")).status, 401);
  assert.equal(
    (
      await api("/api/v1/admin/orders", "GET", undefined, undefined, {
        "Cf-Access-Jwt-Assertion": "forged",
      })
    ).status,
    403,
  );
  const row = await e.DB.prepare("SELECT token_hash FROM orders WHERE id=?")
    .bind(a.orderId)
    .first();
  assert.equal(row.token_hash, await digest(a.token));
  assert.notEqual(row.token_hash, a.token);
});
test("file types, traversal, signatures and length rejected", async () => {
  const o = await create();
  for (const [name, body, mime] of [
    ["x.exe", "MZ", "application/octet-stream"],
    ["../x.xer", "ERMHDR", "text/plain"],
    ["x.xer", "<script>bad</script>", "text/plain"],
    ["x.pdf", "not PDF", "application/pdf"],
    ["x.zip", "PK", "application/zip"],
  ])
    assert.ok((await file(o, "xer", name, body, mime)).status >= 400);
  const r = await file(o);
  assert.equal(r.status, 201, await r.clone().text());
  const f = (await r.json()) as any;
  const listed = (await (
    await api(`/api/v1/orders/${o.orderId}/files`, "GET", undefined, o.token)
  ).json()) as any;
  assert.equal(listed.files.length, 1);
  assert.ok(!JSON.stringify(listed).includes("r2_key"));
  assert.equal(
    (
      await api(
        `/api/v1/orders/${o.orderId}/files/${f.id}`,
        "DELETE",
        undefined,
        o.token,
      )
    ).status,
    200,
  );
});
test("concurrent reservations enforce cumulative byte and count quota", async () => {
  const o = await create();
  const reserve = (i: number) =>
    e.DB.prepare(
      "INSERT INTO order_files(id,order_id,r2_key,name,mime,category,bytes,state,created_at,expires_at) VALUES (?,?,?,'x','text/plain','xer',?,'UPLOADING',?,?)",
    )
      .bind("f" + i, o.orderId, "k" + i, MAX_FILE, clock, clock + TTL)
      .run();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => reserve(i)),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 2);
  await e.DB.prepare("DELETE FROM order_files").run();
  for (let i = 0; i < 5; i++) {
    await reserve(i);
    await e.DB.prepare("UPDATE order_files SET state='READY' WHERE id=?")
      .bind("f" + i)
      .run();
  }
  await assert.rejects(() => reserve(6));
  await e.DB.prepare("DELETE FROM order_files").run();
  for (let i = 0; i < 20; i++)
    await reserve(i).then(() =>
      e.DB.prepare("UPDATE order_files SET bytes=1,state='READY' WHERE id=?")
        .bind("f" + i)
        .run(),
    );
  await assert.rejects(() => reserve(21));
});
test("12-hour exact access boundary, delayed cron, paid and unpaid", async () => {
  const o = await create();
  assert.equal((await file(o)).status, 201);
  clock += TTL - 1;
  assert.equal(
    (await api(`/api/v1/orders/${o.orderId}/files`, "GET", undefined, o.token))
      .status,
    200,
  );
  clock++;
  assert.equal(
    (await api(`/api/v1/orders/${o.orderId}/files`, "GET", undefined, o.token))
      .status,
    410,
  );
  assert.equal((await e.UPLOADS.list()).objects.length, 1);
  await cleanup(e, d);
  assert.equal((await e.UPLOADS.list()).objects.length, 0);
  await cleanup(e, d);
  const row = await e.DB.prepare("SELECT status FROM orders WHERE id=?")
    .bind(o.orderId)
    .first();
  assert.equal(row.status, "EXPIRED_UNPAID");
});
test("checkout requires documents and affirmative current consent; freezes files", async () => {
  const o = await create();
  const q = (await (
    await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
  ).json()) as any;
  assert.equal(
    (
      await api(
        `/api/v1/orders/${o.orderId}/checkout`,
        "POST",
        { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
        o.token,
      )
    ).status,
    409,
  );
  const s = await pay(o);
  assert.equal(s.amount_total, 19900);
  assert.equal(stripeCalls[0].get("payment_method_types[0]"), "card");
  assert.equal(stripeCalls[0].get("success_url"), site + "/payment/success/");
  assert.equal((await file(o)).status, 409);
  assert.equal(
    (await api(`/api/v1/orders/${o.orderId}/status`, "GET", undefined, o.token))
      .status,
    200,
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT paid_at FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).paid_at,
    null,
  );
});
test("webhook verifies signature, live mode, session and authoritative amount; retries idempotent", async () => {
  const o = await create(),
    s = await pay(o);
  s.status = "complete";
  s.payment_status = "paid";
  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  };
  assert.equal((await signed(event, clock - 301)).status, 400);
  assert.equal((await signed({ ...event, livemode: true })).status, 400);
  s.amount_total = 1;
  assert.equal((await signed(event)).status, 400);
  s.amount_total = 19900;
  assert.equal((await signed(event)).status, 200);
  assert.equal((await signed(event)).status, 200);
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM payment_events").first()).n,
    1,
  );
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM notifications").first()).n,
    1,
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).status,
    "PAID",
  );
});
test("late payment does not restore expired files; reupload is manual, authenticated and free", async () => {
  const o = await create(),
    s = await pay(o);
  clock += TTL;
  s.status = "complete";
  s.payment_status = "paid";
  assert.equal(
    (
      await signed({
        id: "evt_late",
        type: "checkout.session.async_payment_succeeded",
        livemode: false,
        data: { object: s },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).status,
    "PAID_FILES_EXPIRED",
  );
  assert.equal(
    (await api(`/api/v1/orders/${o.orderId}/files`, "GET", undefined, o.token))
      .status,
    410,
  );
  assert.equal(
    (await api(`/api/v1/orders/${o.orderId}/reupload`, "POST", {}, o.token))
      .status,
    200,
  );
});
test("cleanup failure retries and late orphan sweep", async () => {
  const o = await create();
  await file(o);
  clock += TTL;
  const broken = {
    ...e,
    UPLOADS: {
      delete: async () => {
        throw Error("test");
      },
      list: e.UPLOADS.list.bind(e.UPLOADS),
    },
  };
  await cleanup(broken, d);
  assert.equal(
    (await e.DB.prepare("SELECT retries FROM order_files").first()).retries,
    1,
  );
  await cleanup(e, d);
  assert.equal((await e.UPLOADS.list()).objects.length, 0);
  const row = await e.DB.prepare("SELECT r2_key FROM order_files").first();
  await e.UPLOADS.put(row.r2_key, "late writer");
  await cleanup(e, d);
  assert.equal((await e.UPLOADS.list()).objects.length, 0);
});
test("rate limit and optional notification minimal payload / duplicate invocation", async () => {
  for (let i = 0; i < 5; i++) await create();
  assert.equal((await api("/api/v1/orders", "POST", {})).status, 429);
});
test("notifications are claimed once and disabled without config", async () => {
  const o = await create(),
    s = await pay(o);
  s.status = "complete";
  s.payment_status = "paid";
  await signed({
    id: "evt_notify",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  });
  await notify(e, d);
  assert.equal(telegramCalls, 0);
  e.TELEGRAM_BOT_TOKEN = "fake";
  e.TELEGRAM_CHAT_ID = "fake";
  await Promise.all([notify(e, d), notify(e, d)]);
  assert.equal(telegramCalls, 1);
});
test("actual streamed oversize rejected without trusting Content-Length", async () => {
  const o = await create();
  const r = await file(
    o,
    "xer",
    "huge.xer",
    "ERMHDR" + "x".repeat(MAX_FILE),
    "text/plain",
  );
  assert.equal(r.status, 413);
  assert.equal((await e.UPLOADS.list()).objects.length, 0);
});
test("upload racing expiry is removed and cannot become READY", async () => {
  const o = await create();
  const bucket = e.UPLOADS;
  const racing = {
    ...e,
    UPLOADS: {
      put: async (...args: any[]) => {
        const r = await bucket.put(...args);
        clock += TTL;
        return r;
      },
      delete: bucket.delete.bind(bucket),
    },
  };
  const r = await app(d).fetch(
    new Request(`https://api.example/api/v1/orders/${o.orderId}/files`, {
      method: "POST",
      headers: {
        origin: site,
        authorization: "Bearer " + o.token,
        "content-type": "text/plain",
        "x-file-name": "test.xer",
        "x-file-category": "xer",
      },
      body: "ERMHDR fixture",
    }),
    racing,
  );
  assert.equal(r.status, 410);
  assert.equal((await bucket.list()).objects.length, 0);
});
test("short remaining TTL blocks new Stripe session", async () => {
  const o = await create();
  await file(o);
  clock += TTL - 1800;
  const q = (await (
    await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
  ).json()) as any;
  const r = await api(
    `/api/v1/orders/${o.orderId}/checkout`,
    "POST",
    { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
    o.token,
  );
  assert.equal(r.status, 409);
  assert.equal(stripeCalls.length, 0);
});
test("async pending is not paid; wrong currency/session and forged signatures rejected", async () => {
  const o = await create(),
    s = await pay(o);
  const ev = {
    id: "evt_pending",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  };
  assert.equal((await signed(ev)).status, 200);
  assert.equal(
    (
      await e.DB.prepare("SELECT paid_at,status FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).status,
    "PAYMENT_PROCESSING",
  );
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM notifications").first()).n,
    0,
  );
  s.currency = "eur";
  assert.equal((await signed({ ...ev, id: "evt_wrong" })).status, 400);
  s.currency = "usd";
  assert.equal(
    (
      await signed({
        ...ev,
        id: "evt_wrong_session",
        data: { object: { ...s, id: "cs_other" } },
      })
    ).status,
    409,
  );
  await assert.rejects(() =>
    signature("{}", `t=${clock},v1=deadbeef`, e.STRIPE_WEBHOOK_SECRET, clock),
  );
});
test("valid admin JWT verifies signature, audience, issuer, expiry and allowlist", async () => {
  const { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } =
    await import("jose");
  const { verifyAdminJWT } = await import("../src/security");
  const config = JSON.parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const accessEnv = { ...e, ...config.vars };
  assert.equal(accessEnv.APP_ENV, "production");
  assert.equal(accessEnv.PORTAL_ENABLED, "false");
  assert.equal(accessEnv.LEGAL_APPROVED, "true");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const resolver = createLocalJWKSet({ keys: [jwk] });
  const jwt = await new SignJWT({ email: accessEnv.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(accessEnv.ACCESS_ISSUER)
    .setAudience(accessEnv.ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
  assert.equal(await verifyAdminJWT(jwt, accessEnv, resolver), "access-admin");
  const expired = await new SignJWT({ email: accessEnv.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(accessEnv.ACCESS_ISSUER)
    .setAudience(accessEnv.ACCESS_AUD)
    .setExpirationTime(1)
    .sign(privateKey);
  await assert.rejects(() => verifyAdminJWT(expired, accessEnv, resolver));
  await assert.rejects(() =>
    verifyAdminJWT(jwt, { ...accessEnv, ACCESS_AUD: "wrong" }, resolver),
  );
  await assert.rejects(() =>
    verifyAdminJWT(
      jwt,
      { ...accessEnv, ACCESS_ISSUER: "https://other.cloudflareaccess.com" },
      resolver,
    ),
  );
  await assert.rejects(() =>
    verifyAdminJWT(
      jwt,
      { ...accessEnv, ADMIN_EMAILS: "other@example.com" },
      resolver,
    ),
  );
  const noExpiry = await new SignJWT({ email: accessEnv.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(accessEnv.ACCESS_ISSUER)
    .setAudience(accessEnv.ACCESS_AUD)
    .sign(privateKey);
  await assert.rejects(() => verifyAdminJWT(noExpiry, accessEnv, resolver));
  const attacker = await generateKeyPair("RS256");
  const forged = await new SignJWT({ email: accessEnv.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(accessEnv.ACCESS_ISSUER)
    .setAudience(accessEnv.ACCESS_AUD)
    .setExpirationTime("2m")
    .sign(attacker.privateKey);
  await assert.rejects(() => verifyAdminJWT(forged, accessEnv, resolver));
});
test("scheduled handler registers cleanup work", async () => {
  const pending: Promise<any>[] = [];
  await app(d).scheduled({} as any, e, {
    waitUntil: (p: Promise<any>) => pending.push(p),
  } as any);
  await Promise.all(pending);
  assert.equal(pending.length, 1);
});

test("authenticated admin downloads only paid live files and issues one no-charge reupload", async () => {
  const { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } =
    await import("jose");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "admin-route";
  const jwt = await new SignJWT({ email: "operator@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(e.ACCESS_ISSUER)
    .setAudience(e.ACCESS_AUD)
    .setExpirationTime("2m")
    .sign(privateKey);
  const deps = { ...d, adminKeys: createLocalJWKSet({ keys: [jwk] }) };
  const admin = (path: string, action?: string) =>
    app(deps).fetch(
      new Request("https://api.example/api/v1/admin/orders" + path, {
        method: action ? "POST" : "GET",
        headers: {
          origin: site,
          "content-type": "application/json",
          "Cf-Access-Jwt-Assertion": jwt,
        },
        body: action ? JSON.stringify({ action }) : undefined,
      }),
      e,
    );
  const o = await create(),
    s = await pay(o);
  const f = await e.DB.prepare("SELECT id FROM order_files WHERE order_id=?")
    .bind(o.orderId)
    .first();
  assert.equal((await admin(`/${o.orderId}/files/${f.id}`)).status, 403);
  s.status = "complete";
  s.payment_status = "paid";
  await signed({
    id: "evt_admin",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  });
  assert.equal(
    (await admin(`/${o.orderId}/actions`, "mark-retrieved")).status,
    409,
  );
  const download = await admin(`/${o.orderId}/files/${f.id}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("Content-Disposition")!, /^attachment/);
  assert.match(await download.text(), /^ERMHDR/);
  assert.equal(
    (await admin(`/${o.orderId}/actions`, "mark-retrieved")).status,
    200,
  );
  clock += TTL;
  assert.equal((await admin(`/${o.orderId}/files/${f.id}`)).status, 410);
  const child = (await (
    await admin(`/${o.orderId}/actions`, "issue-reupload")
  ).json()) as any;
  assert.ok(child.token);
  assert.equal(
    (await admin(`/${child.orderId}/actions`, "mark-retrieved")).status,
    409,
  );
  assert.equal(
    (await admin(`/${o.orderId}/actions`, "issue-reupload")).status,
    409,
  );
  assert.equal((await file(child)).status, 201);
  const q = (await (
    await api(`/api/v1/orders/${child.orderId}/quote`, "POST", {}, child.token)
  ).json()) as any;
  assert.equal(q.missing.length, 0);
  assert.equal(
    (
      await api(
        `/api/v1/orders/${child.orderId}/checkout`,
        "POST",
        { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
        child.token,
      )
    ).status,
    409,
  );
  assert.equal(stripeCalls.length, 1);
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM orders WHERE id=?")
        .bind(child.orderId)
        .first()
    ).status,
    "PAID",
  );
});

test("all package activity boundaries, delivery days and material prices", () => {
  assert.deepEqual(
    packages.map((p) => [p.cents, p.activities, p.days]),
    [
      [19900, 150, 5],
      [49900, 75, 5],
      [79900, 75, 7],
      [99900, 200, 10],
      [149900, 200, 12],
      [39900, 200, 4],
      [64900, 200, 5],
    ],
  );
  for (const p of packages) {
    const c = (n: number) => cart(p.sku, n, { existingResources: true });
    const unit = p.resources
      ? p.sku.startsWith("update")
        ? 15000
        : 17500
      : 10000;
    assert.equal(quote(c(p.activities)).total, p.cents);
    for (const delta of [1, 49, 50, 51]) {
      const q = quote(c(p.activities + delta));
      assert.equal(q.total, p.cents + Math.ceil(delta / 50) * unit);
      assert.equal(
        q.scopeReview.length > 0,
        Math.ceil(delta / 50) > p.maxBlocks,
      );
    }
    assert.equal(
      quote(c(p.activities + p.maxBlocks * 50)).scopeReview.length,
      0,
    );
    assert.ok(quote(c(p.activities + p.maxBlocks * 50 + 1)).scopeReview.length);
  }
  for (const code of [
    "concrete",
    "rebar",
    "formwork",
    "structural_steel",
    "piping",
  ]) {
    for (const rows of [1, 50]) {
      assert.equal(
        quote(
          cart("baseline_basic_withres", 75, { materials: [{ code, rows }] }),
        ).total,
        104800,
      );
      const q = quote(
        cart("update_withres", 200, {
          existingResources: true,
          materials: [{ code, rows }],
        }),
      );
      assert.equal(q.total, 76800);
      assert.ok(q.scopeReview.length);
    }
    assert.ok(
      quote(
        cart("baseline_basic_withres", 75, { materials: [{ code, rows: 51 }] }),
      ).scopeReview.length,
    );
  }
  for (const activities of [0, -1, 1.5, Infinity, NaN, 10001])
    assert.throws(() => quote(cart("p6_audit", activities)));
  assert.throws(() => quote({ ...cart(), sku: ["p6_audit", "update_nores"] }));
  assert.throws(() =>
    quote(
      cart("baseline_basic_withres", 75, {
        materials: [{ code: "concrete", rows: 0 }],
      }),
    ),
  );
});

test("invoice flag is explicit, billing details collected and no production enabling", async () => {
  const a = await create();
  await pay(a);
  assert.equal(stripeCalls[0].get("invoice_creation[enabled]"), "false");
  assert.equal(
    stripeCalls[0].has("invoice_creation[invoice_data][metadata][order_id]"),
    false,
  );
  e.INVOICE_CREATION = "true";
  e.TAX_MODE = "automatic";
  const b = await create();
  await pay(b);
  const params = stripeCalls[1];
  assert.equal(params.get("invoice_creation[enabled]"), "true");
  assert.equal(params.get("customer_creation"), "always");
  assert.equal(params.get("billing_address_collection"), "required");
  assert.equal(params.get("customer_email"), "test@example.com");
  assert.equal(params.get("automatic_tax[enabled]"), "true");
  assert.equal(
    params.get("invoice_creation[invoice_data][metadata][order_id]"),
    b.orderId,
  );
  assert.match(
    params.get("invoice_creation[invoice_data][description]")!,
    /^Bluefin Tuna LLC/,
  );
  assert.equal(ready({ ...e, APP_ENV: "production" }), false);
  assert.equal(ready({ ...e, TAX_MODE: "unconfigured" }), false);
});

test("verified tax-inclusive amount and invoice reference persist; negative tax rejected", async () => {
  const o = await create(),
    s = await pay(o);
  s.status = "complete";
  s.payment_status = "paid";
  s.invoice = "in_test_reference";
  s.total_details.amount_tax = 1990;
  s.amount_total = 21890;
  const ev = {
    id: "evt_invoice",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  };
  s.total_details.amount_tax = -100;
  s.amount_total = 19800;
  assert.equal((await signed(ev)).status, 400);
  s.total_details.amount_tax = 1990;
  s.amount_total = 21890;
  assert.equal((await signed(ev)).status, 200);
  const row = await e.DB.prepare(
    "SELECT paid_total,paid_tax,stripe_invoice_id FROM orders WHERE id=?",
  )
    .bind(o.orderId)
    .first();
  assert.deepEqual(
    { ...row },
    {
      paid_total: 21890,
      paid_tax: 1990,
      stripe_invoice_id: "in_test_reference",
    },
  );
});

test("wrong merchant account, webhook account and metadata are rejected", async () => {
  const o = await create();
  d.fetch = async (url: any, opt: any) =>
    String(url).endsWith("/account")
      ? Response.json({ id: "acct_other" })
      : fakeFetch(url, opt);
  await file(o);
  let q = (await (
    await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
  ).json()) as any;
  assert.equal(
    (
      await api(
        `/api/v1/orders/${o.orderId}/checkout`,
        "POST",
        { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
        o.token,
      )
    ).status,
    503,
  );
  assert.equal(stripeCalls.length, 0);
  d.fetch = fakeFetch;
  const s = await pay(o);
  s.status = "complete";
  s.payment_status = "paid";
  const ev = {
    id: "evt_account",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  };
  assert.equal((await signed({ ...ev, account: "acct_other" })).status, 400);
  s.metadata.order_id = "other";
  assert.equal((await signed(ev)).status, 409);
  s.metadata.order_id = o.orderId;
  s.metadata.quote_hash = "changed";
  assert.equal((await signed(ev)).status, 400);
});

test("consent/version/hash and client total cannot be bypassed; cancel-return retry reuses session", async () => {
  const o = await create();
  await file(o);
  const q = (await (
    await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
  ).json()) as any;
  const path = `/api/v1/orders/${o.orderId}/checkout`,
    b = { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash };
  for (const body of [
    { ...b, consent: false },
    { ...b, termsVersion: "old" },
    { ...b, quoteHash: "fake" },
    { ...b, total: 1 },
  ])
    assert.ok((await api(path, "POST", body, o.token)).status >= 400);
  const first = (await (await api(path, "POST", b, o.token)).json()) as any;
  const again = (await (await api(path, "POST", b, o.token)).json()) as any;
  assert.equal(first.url, again.url);
  assert.equal(stripeCalls.length, 1);
  assert.equal(
    (await api(path, "POST", { ...b, consent: false }, o.token)).status,
    400,
  );
  const s = sessions["cs_test_" + o.orderId];
  s.status = "expired";
  assert.equal((await api(path, "POST", b, o.token)).status, 409);
  assert.equal(
    (
      await signed({
        id: "evt_expired",
        type: "checkout.session.expired",
        livemode: false,
        data: { object: s },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT paid_at,status FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).status,
    "EXPIRED_UNPAID",
  );
});

test("async failure then verified success is reconciled without paid downgrade", async () => {
  const o = await create(),
    s = await pay(o);
  s.status = "complete";
  const event = (id: string, type: string) => ({
    id,
    type,
    livemode: false,
    data: { object: s },
  });
  assert.equal(
    (await signed(event("evt_fail", "checkout.session.async_payment_failed")))
      .status,
    200,
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).status,
    "CANCELLED",
  );
  s.payment_status = "paid";
  const ev = event("evt_paid", "checkout.session.async_payment_succeeded");
  const responses = await Promise.all([signed(ev), signed(ev)]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM notifications").first()).n,
    1,
  );
  s.payment_status = "unpaid";
  await signed(
    event("evt_older_fail", "checkout.session.async_payment_failed"),
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).status,
    "PAID",
  );
});

test("upload rejects forged lengths, MIME, category mismatch, Office archives and aborted streams", async () => {
  const o = await create();
  for (const [name, mime, body] of [
    [
      "table.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "PK\x03\x04",
    ],
    [
      "text.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "PK\x03\x04",
    ],
    ["table.xls", "application/vnd.ms-excel", "\u00d0\u00cf\u0011\u00e0"],
    [
      "macro.xlsm",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      "PK\x03\x04",
    ],
    ["archive.zip", "application/zip", "PK\x03\x04"],
    ["text.pdf", "text/plain", "%PDF-1.7"],
  ])
    assert.equal((await file(o, "boq", name, body, mime)).status, 415);
  assert.equal(
    (await file(o, "xer", "fake.pdf", "%PDF-1.7", "application/pdf")).status,
    415,
  );
  const upload = (body: any, length: string) =>
    app(d).fetch(
      new Request(`https://api.example/api/v1/orders/${o.orderId}/files`, {
        method: "POST",
        headers: {
          origin: site,
          authorization: "Bearer " + o.token,
          "content-type": "text/plain",
          "x-file-name": "test.xer",
          "x-file-category": "xer",
          "content-length": length,
        },
        body,
        duplex: "half",
      } as any),
      e,
    );
  assert.equal((await upload("ERMHDR", String(MAX_FILE + 1))).status, 413);
  assert.equal(
    (await upload("ERMHDR" + "x".repeat(MAX_FILE), "1")).status,
    413,
  );
  const aborted = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("ERMHDR"));
      c.error(Error("simulated client disconnect"));
    },
  });
  assert.equal((await upload(aborted, "6")).status, 400);
  assert.equal((await e.UPLOADS.list()).objects.length, 0);
  assert.equal(
    (await file(o, "boq", "data.csv", "activity,quantity\nA,2", "text/csv"))
      .status,
    201,
  );
  assert.equal(
    (
      await file(
        o,
        "drawings",
        "drawing.pdf",
        "%PDF-1.7\nsynthetic only",
        "application/pdf",
      )
    ).status,
    201,
  );
  assert.equal((await file(o)).status, 201);
});

test("forged capabilities cannot read, upload or delete another order", async () => {
  const a = await create(),
    b = await create();
  const f = (await (await file(a)).json()) as any;
  for (const token of [b.token, "0".repeat(64)]) {
    assert.equal(
      (await api(`/api/v1/orders/${a.orderId}/files`, "GET", undefined, token))
        .status,
      404,
    );
    assert.equal(
      (
        await api(
          `/api/v1/orders/${a.orderId}/files/${f.id}`,
          "DELETE",
          undefined,
          token,
        )
      ).status,
      404,
    );
    assert.equal((await file({ ...a, token })).status, 404);
  }
  // A genuinely stolen bearer credential grants its scoped permissions: never claim token hashing prevents theft.
  assert.equal(
    (await api(`/api/v1/orders/${a.orderId}/files`, "GET", undefined, a.token))
      .status,
    200,
  );
  clock += TTL;
  assert.equal(
    (await api(`/api/v1/orders/${a.orderId}/files`, "GET", undefined, a.token))
      .status,
    410,
  );
});

test("operational monitor detects cleanup backlog, missing heartbeat and exhausted notifications without PII", async () => {
  const { operations } = await import("../src/operations");
  const o = await create(),
    s = await pay(o);
  s.status = "complete";
  s.payment_status = "paid";
  await signed({
    id: "evt_ops",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  });
  assert.equal((await api("/api/v1/admin/operations")).status, 401);
  let m = await operations(e, d);
  assert.ok(m.alerts.includes("cleanup_heartbeat_missing_or_stale"));
  assert.equal(m.notifications.enabled, false);
  e.TELEGRAM_BOT_TOKEN = "fake";
  e.TELEGRAM_CHAT_ID = "fake";
  await e.DB.prepare("UPDATE notifications SET attempts=8,state='RETRY'").run();
  clock += TTL;
  m = await operations(e, d);
  assert.ok(m.alerts.includes("notification_delivery_delayed"));
  assert.ok(m.alerts.includes("file_deletion_backlog"));
  await cleanup(e, d);
  m = await operations(e, d);
  assert.equal(m.cleanup.completedAt, clock);
  assert.equal(m.files.overdue, 0);
  assert.equal(m.notifications.exhausted, 1);
  assert.ok(!JSON.stringify(m).includes(o.token));
  assert.ok(!JSON.stringify(m).includes("test@example.com"));
  assert.ok(!JSON.stringify(m).includes("test.xer"));
});

test("checkout rejects stale price-policy hashes until a new server quote is reviewed", async () => {
  const o = await create();
  await file(o);
  await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token);
  await e.DB.prepare(
    "UPDATE orders SET subtotal=1,quote_hash='old-policy' WHERE id=?",
  )
    .bind(o.orderId)
    .run();
  const b = { consent: true, termsVersion: TERMS, quoteHash: "old-policy" };
  assert.equal(
    (await api(`/api/v1/orders/${o.orderId}/checkout`, "POST", b, o.token))
      .status,
    409,
  );
  assert.equal(stripeCalls.length, 0);
  const q = (await (
    await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
  ).json()) as any;
  assert.equal(
    (
      await e.DB.prepare("SELECT subtotal FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).subtotal,
    q.total,
  );
  assert.equal(
    (
      await api(
        `/api/v1/orders/${o.orderId}/checkout`,
        "POST",
        { ...b, quoteHash: q.quoteHash },
        o.token,
      )
    ).status,
    200,
  );
});

test("Turnstile rejects successful tokens with wrong hostname or action", async () => {
  for (const response of [
    { success: true, hostname: "other.example", action: "create-order" },
    { success: true, hostname: "bluefintuna.life", action: "other-action" },
    { success: false, hostname: "bluefintuna.life", action: "create-order" },
  ]) {
    d.fetch = async (url: any, options: any) =>
      String(url).includes("siteverify")
        ? Response.json(response)
        : fakeFetch(url, options);
    const result = await api("/api/v1/orders", "POST", {
      cart: cart(),
      customer: {
        name: "Test",
        email: "test@example.com",
        project: "Synthetic",
        dataDate: "2026-10-29",
      },
      turnstileToken: "synthetic-test-token",
    });
    assert.equal(result.status, 403);
    assert.equal(((await result.json()) as any).error, "challenge_failed");
  }
  const row = await e.DB.prepare("SELECT COUNT(*) AS n FROM orders").first();
  assert.equal(row.n, 0);
});

test("agreement evidence binds every core package to one version, scope and session", async () => {
  for (const pack of packages) {
    clock += 3601; // Separate customers/test windows; preserve the real rate limiter.
    const o = await create(
      cart(pack.sku, pack.activities, { existingResources: true }),
    );
    const required = quote(
      cart(pack.sku, pack.activities, { existingResources: true }),
    ).required;
    for (const category of required)
      assert.equal((await file(o, category)).status, 201);
    const q: any = await (
      await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
    ).json();
    for (const consent of [false, undefined, "true"]) {
      assert.equal(
        (
          await api(
            `/api/v1/orders/${o.orderId}/checkout`,
            "POST",
            { consent, termsVersion: TERMS, quoteHash: q.quoteHash },
            o.token,
          )
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await api(
          `/api/v1/orders/${o.orderId}/checkout`,
          "POST",
          {
            consent: true,
            termsVersion: "old-version",
            quoteHash: q.quoteHash,
          },
          o.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          `/api/v1/orders/${o.orderId}/checkout`,
          "POST",
          { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
          o.token,
        )
      ).status,
      200,
    );
    const row: any = await e.DB.prepare(
      "SELECT * FROM agreement_acceptances WHERE order_id=?",
    )
      .bind(o.orderId)
      .first();
    assert.equal(row.agreement_version, TERMS);
    assert.match(row.agreement_sha256, /^[a-f0-9]{64}$/);
    assert.equal(row.portal_accepted_at, clock);
    assert.equal(row.stripe_session_id, "cs_test_" + o.orderId);
    assert.equal(JSON.parse(row.scope_json).cart.sku, pack.sku);
    assert.equal(row.stripe_terms_status, "PENDING");
    assert.equal(
      stripeCalls.at(-1).get("consent_collection[terms_of_service]"),
      "required",
    );
  }
});

test("missing Stripe acceptance or wrong policy metadata never marks an order paid", async () => {
  const o = await create();
  const session = await pay(o);
  session.status = "complete";
  session.payment_status = "paid";
  const event = {
    id: "evt_agreement",
    type: "checkout.session.completed",
    livemode: false,
    created: clock - 1,
    data: { object: session },
  };
  session.consent = null;
  assert.equal((await signed(event)).status, 409);
  assert.equal(
    (
      await e.DB.prepare("SELECT paid_at FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).paid_at,
    null,
  );
  session.consent = { terms_of_service: "accepted" };
  const version = session.metadata.agreement_version;
  session.metadata.agreement_version = "wrong";
  assert.equal((await signed(event)).status, 409);
  session.metadata.agreement_version = version;
  assert.equal((await signed(event)).status, 200);
  const evidence: any = await e.DB.prepare(
    "SELECT * FROM agreement_acceptances WHERE order_id=?",
  )
    .bind(o.orderId)
    .first();
  assert.equal(evidence.stripe_terms_status, "ACCEPTED");
  assert.equal(evidence.stripe_verified_at, clock);
  assert.equal(evidence.stripe_event_created_at, clock - 1);
  assert.equal(evidence.stripe_event_id, "evt_agreement");
  assert.equal(evidence.stripe_session_id, session.id);
  await assert.rejects(() =>
    e.DB.prepare(
      "UPDATE agreement_acceptances SET agreement_version=? WHERE order_id=?",
    )
      .bind("tampered", o.orderId)
      .run(),
  );
  clock += 5;
  assert.equal((await signed(event)).status, 200);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT stripe_verified_at FROM agreement_acceptances WHERE order_id=?",
      )
        .bind(o.orderId)
        .first()
    ).stripe_verified_at,
    evidence.stripe_verified_at,
  );
});

test("one contract covers compatible addon scope; pilot and unreviewed Update materials cannot bypass eligibility", async () => {
  const carts = [
    cart("baseline_basic_nores", 76, { revisions: 1 }),
    cart("baseline_basic_withres", 76, {
      materials: [{ code: "concrete", rows: 50 }],
    }),
    cart("update_withres", 201, { existingResources: true }),
  ];
  for (const c of carts) {
    const o = await create(c);
    for (const k of quote(c).required) await file(o, k);
    const q: any = await (
      await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
    ).json();
    assert.equal(
      (
        await api(
          `/api/v1/orders/${o.orderId}/checkout`,
          "POST",
          { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
          o.token,
        )
      ).status,
      200,
    );
    const row: any = await e.DB.prepare(
      "SELECT scope_json,agreement_version FROM agreement_acceptances WHERE order_id=?",
    )
      .bind(o.orderId)
      .first();
    assert.equal(row.agreement_version, TERMS);
    assert.ok(JSON.parse(row.scope_json).lines.length > 1);
  }
  for (const code of [
    "concrete",
    "rebar",
    "formwork",
    "structural_steel",
    "piping",
  ]) {
    assert.equal(
      quote(
        cart("baseline_basic_withres", 75, { materials: [{ code, rows: 50 }] }),
      ).scopeReview.length,
      0,
    );
    assert.ok(
      quote(
        cart("update_withres", 200, {
          existingResources: true,
          materials: [{ code, rows: 50 }],
        }),
      ).scopeReview.length > 0,
    );
  }
  assert.throws(() => quote(cart("schedule_score", 1)), /unknown_package/);
});

test("historical v1 remains Draft and byte-identical after owner-adopted v2 publication", async () => {
  const { createHash } = await import("node:crypto");
  const v1 = readFileSync(
    new URL(
      "../../../data/legal/service-terms-2026-10-30-v1.json",
      import.meta.url,
    ),
  );
  assert.equal(
    createHash("sha256").update(v1).digest("hex"),
    "879b2b5523360d2ed69d78facab8dd377ebd7f63780d2d37c14c762835005876",
  );
  assert.equal(JSON.parse(v1.toString()).status, "DRAFT");
});

test("direct Payment Link metadata cannot bind a session or fabricate D1 consent", async () => {
  const o = await create();
  const s = await pay(o);
  s.status = "complete";
  s.payment_status = "paid";
  const event = {
    id: "evt_direct_link",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { ...s, id: "cs_other_link" } },
  };
  assert.equal((await signed(event)).status, 409);
  await e.DB.prepare("DELETE FROM agreement_acceptances WHERE order_id=?")
    .bind(o.orderId)
    .run();
  await e.DB.prepare(
    "UPDATE orders SET consent_version='historical' WHERE id=?",
  )
    .bind(o.orderId)
    .run();
  event.data.object = s;
  assert.equal((await signed(event)).status, 409);
  assert.equal(
    (
      await e.DB.prepare("SELECT paid_at FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).paid_at,
    null,
  );
});
test("missing or changed Catalog price fails closed without dynamic product creation", async () => {
  const o = await create();
  await file(o);
  const q: any = await (
    await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
  ).json();
  for (const data of [
    [],
    [
      {
        id: "price_wrong",
        lookup_key: "p6_audit",
        unit_amount: 1,
        currency: "usd",
        active: true,
        type: "one_time",
        livemode: false,
        product: { active: true, livemode: false },
      },
    ],
  ]) {
    d.fetch = async (url: any, opt: any) =>
      String(url).includes("/prices?")
        ? Response.json({ data, has_more: false })
        : fakeFetch(url, opt);
    const r = await api(
      `/api/v1/orders/${o.orderId}/checkout`,
      "POST",
      { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
      o.token,
    );
    assert.equal(r.status, 503);
    assert.equal(
      ((await r.json()) as any).error,
      "catalog_price_missing_or_mismatched",
    );
  }
  assert.equal(stripeCalls.length, 0);
});

function paidAutomatic(s: any, tax = 1234, reason = "standard_rated") {
  Object.assign(s, {
    status: "complete",
    payment_status: "paid",
    amount_total: s.amount_subtotal + tax,
    customer_details: {
      address: {
        country: "US",
        state: tax ? "SD" : "OR",
        line1: "Synthetic fixture",
        postal_code: tax ? "57104" : "97205",
      },
    },
    automatic_tax: { enabled: true, status: "complete" },
    total_details: {
      amount_tax: tax,
      amount_discount: 0,
      amount_shipping: 0,
      breakdown: {
        taxes: [
          {
            amount: tax,
            taxable_amount: s.amount_subtotal,
            taxability_reason: reason,
            rate: {
              id: "txr_fixture",
              livemode: false,
              inclusive: false,
              country: "US",
              state: tax ? "SD" : "OR",
              percentage: tax ? 6.2 : 0,
              tax_type: "sales_tax",
            },
          },
        ],
      },
    },
  });
  return {
    id: "evt_tax_" + s.id,
    type: "checkout.session.completed",
    livemode: false,
    data: { object: s },
  };
}
test("automatic Tax uses exclusive consulting Catalog prices, required address and optional tax ID", async () => {
  e.TAX_MODE = "automatic";
  const o = await create();
  await pay(o);
  const b = stripeCalls[0];
  assert.equal(b.get("automatic_tax[enabled]"), "true");
  assert.equal(b.get("adaptive_pricing[enabled]"), "false");
  assert.equal(b.get("billing_address_collection"), "required");
  assert.equal(b.get("tax_id_collection[enabled]"), "true");
  assert.equal(b.get("tax_id_collection[required]"), "never");
  assert.equal(b.get("consent_collection[terms_of_service]"), "required");
  const r: any = await e.DB.prepare(
    "SELECT * FROM checkout_tax_requirements WHERE order_id=?",
  )
    .bind(o.orderId)
    .first();
  assert.equal(r.mode, "automatic");
  assert.equal(r.stripe_session_id, "cs_test_" + o.orderId);
});
for (const reason of ["standard_rated", "not_collecting", "not_subject_to_tax"])
  test("verified Tax receipt persists actual reason: " + reason, async () => {
    e.TAX_MODE = "automatic";
    const o = await create(),
      s = await pay(o),
      event = paidAutomatic(s, reason === "standard_rated" ? 1234 : 0, reason);
    e.TAX_MODE = "unconfigured";
    e.PORTAL_ENABLED = "false";
    try {
      assert.equal((await signed(event)).status, 200);
      assert.equal((await signed(event)).status, 200);
      const r: any = await e.DB.prepare(
        "SELECT * FROM payment_tax_evidence WHERE order_id=?",
      )
        .bind(o.orderId)
        .first();
      assert.equal(r.total, s.amount_total);
      assert.equal(r.subtotal, s.amount_subtotal);
      assert.equal(r.tax, s.total_details.amount_tax);
      assert.equal(JSON.parse(r.breakdown_json)[0].taxability_reason, reason);
      assert.equal(
        (
          await e.DB.prepare("SELECT status FROM orders WHERE id=?")
            .bind(o.orderId)
            .first()
        ).status,
        "PAID",
      );
      await assert.rejects(
        e.DB.prepare("UPDATE payment_tax_evidence SET tax=0 WHERE order_id=?")
          .bind(o.orderId)
          .run(),
        /immutable_tax_evidence/,
      );
    } finally {
      e.PORTAL_ENABLED = "true";
    }
  });
for (const failure of [
  "failed",
  "requires_location_inputs",
  "missing_amount",
  "missing_reason",
  "missing_address",
  "inclusive",
  "wrong_sum",
  "disabled",
])
  test("automatic Tax fails closed before PAID: " + failure, async () => {
    e.TAX_MODE = "automatic";
    const o = await create(),
      s = await pay(o),
      event = paidAutomatic(s);
    if (["failed", "requires_location_inputs"].includes(failure))
      s.automatic_tax.status = failure;
    if (failure === "missing_amount") delete s.total_details.amount_tax;
    if (failure === "missing_reason")
      delete s.total_details.breakdown.taxes[0].taxability_reason;
    if (failure === "missing_address") s.customer_details.address = null;
    if (failure === "inclusive")
      s.total_details.breakdown.taxes[0].rate.inclusive = true;
    if (failure === "wrong_sum") s.total_details.breakdown.taxes[0].amount++;
    if (failure === "disabled") s.automatic_tax.enabled = false;
    assert.notEqual((await signed(event)).status, 200);
    const row: any = await e.DB.prepare("SELECT paid_at FROM orders WHERE id=?")
      .bind(o.orderId)
      .first();
    assert.equal(row.paid_at, null);
    assert.equal(
      await e.DB.prepare("SELECT * FROM payment_tax_evidence WHERE order_id=?")
        .bind(o.orderId)
        .first(),
      null,
    );
  });
for (const failure of [
  "settings_pending",
  "settings_http_error",
  "inclusive_price",
  "wrong_code",
])
  test(
    "automatic Tax blocks Checkout configuration failure: " + failure,
    async () => {
      e.TAX_MODE = "automatic";
      d.fetch = async (url: any, opt: any) => {
        if (String(url).endsWith("/tax/settings"))
          return failure === "settings_http_error"
            ? new Response("{}", { status: 503 })
            : Response.json({
                status: failure === "settings_pending" ? "pending" : "active",
                livemode: false,
              });
        const r = await fakeFetch(url, opt);
        if (String(url).includes("/prices?")) {
          const j: any = await r.json();
          if (failure === "inclusive_price")
            j.data[0].tax_behavior = "inclusive";
          if (failure === "wrong_code")
            j.data[0].product.tax_code = "txcd_00000000";
          return Response.json(j);
        }
        return r;
      };
      const o = await create();
      await file(o);
      const q: any = await (
        await api(`/api/v1/orders/${o.orderId}/quote`, "POST", {}, o.token)
      ).json();
      const r = await api(
        `/api/v1/orders/${o.orderId}/checkout`,
        "POST",
        { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
        o.token,
      );
      assert.equal(r.status, failure === "settings_http_error" ? 502 : 503);
      assert.equal(stripeCalls.length, 0);
    },
  );
test("expired unpaid automatic Tax session needs no completed tax calculation and creates no tax evidence", async () => {
  e.TAX_MODE = "automatic";
  const o = await create(),
    s = await pay(o);
  s.status = "expired";
  s.automatic_tax.status = "requires_location_inputs";
  const r = await signed({
    id: "evt_tax_cancel",
    type: "checkout.session.expired",
    livemode: false,
    data: { object: s },
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM orders WHERE id=?")
        .bind(o.orderId)
        .first()
    ).status,
    "EXPIRED_UNPAID",
  );
  assert.equal(
    await e.DB.prepare("SELECT * FROM payment_tax_evidence WHERE order_id=?")
      .bind(o.orderId)
      .first(),
    null,
  );
});

for (const tax_behavior of ["exclusive", "inferred_by_currency"])
  test(
    "automatic Tax verifies inherited consulting/USD defaults: " + tax_behavior,
    async () => {
      e.TAX_MODE = "automatic";
      d.fetch = async (url: any, opt: any) => {
        if (String(url).endsWith("/tax/settings"))
          return Response.json({
            status: "active",
            livemode: false,
            defaults: { tax_code: "txcd_20060048", tax_behavior },
          });
        const r = await fakeFetch(url, opt);
        if (String(url).includes("/prices?")) {
          const j: any = await r.json();
          j.data[0].tax_behavior = "unspecified";
          j.data[0].product.tax_code = null;
          return Response.json(j);
        }
        return r;
      };
      const o = await create(),
        s = await pay(o);
      assert.equal(s.automatic_tax.enabled, true);
      assert.equal(stripeCalls.length, 1);
    },
  );
