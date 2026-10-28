import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  if (String(url).endsWith("/account"))
    return Response.json({ id: "acct_test" });
  if (String(url).endsWith("/checkout/sessions")) {
    const b = new URLSearchParams(opt.body);
    stripeCalls.push(b);
    const oid = b.get("client_reference_id");
    const total = [...b.keys()]
      .filter((k) => k.endsWith("[unit_amount]"))
      .reduce(
        (s, k) =>
          s +
          Number(b.get(k)) *
            Number(b.get(k.replace("[price_data][unit_amount]", "[quantity]"))),
        0,
      );
    const s = {
      id: "cs_test_" + oid,
      url: "https://checkout.stripe.com/c/pay/" + oid,
      client_reference_id: oid,
      metadata: { order_id: oid, quote_hash: b.get("metadata[quote_hash]") },
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
  const sid = String(url).split("/").pop();
  return Response.json(sessions[sid!] || {});
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
  const sql = readFileSync(
    new URL("../migrations/0001_init.sql", import.meta.url),
    "utf8",
  );
  await e.DB.exec(sql.replace(/\n/g, " "));
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
    "notifications",
    "payment_events",
    "audit_events",
    "order_files",
    "orders",
    "rate_limits",
    "housekeeping",
  ])
    await e.DB.prepare(`DELETE FROM ${table}`).run();
  const list = await e.UPLOADS.list();
  for (const o of list.objects) await e.UPLOADS.delete(o.key);
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
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 5);
  await e.DB.prepare("DELETE FROM order_files").run();
  for (let i = 0; i < 20; i++)
    await reserve(i).then(() =>
      e.DB.prepare("UPDATE order_files SET bytes=1 WHERE id=?")
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
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const resolver = createLocalJWKSet({ keys: [jwk] });
  const jwt = await new SignJWT({ email: "operator@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(e.ACCESS_ISSUER)
    .setAudience(e.ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
  assert.equal(await verifyAdminJWT(jwt, e, resolver), "access-admin");
  const expired = await new SignJWT({ email: "operator@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(e.ACCESS_ISSUER)
    .setAudience(e.ACCESS_AUD)
    .setExpirationTime(1)
    .sign(privateKey);
  await assert.rejects(() => verifyAdminJWT(expired, e, resolver));
  await assert.rejects(() =>
    verifyAdminJWT(jwt, { ...e, ACCESS_AUD: "wrong" }, resolver),
  );
  await assert.rejects(() =>
    verifyAdminJWT(
      jwt,
      { ...e, ACCESS_ISSUER: "https://other.cloudflareaccess.com" },
      resolver,
    ),
  );
  await assert.rejects(() =>
    verifyAdminJWT(jwt, { ...e, ADMIN_EMAILS: "other@example.com" }, resolver),
  );
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
