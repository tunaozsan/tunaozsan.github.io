import { applyRefund, checkRefund, reconcileRefunds } from "../src/refunds";
import { webhook } from "../src/payments";
import staging from "../src/staging";
import { production } from "../src/production";
import { LIVE_ACCOUNT_ID } from "../src/live-catalog";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { deliveryRoute, deliveryMaintenance } from "../src/delivery";
import {
  access,
  enqueue,
  seal,
  unseal,
  transfer,
  verifiedTransferPayment,
} from "../src/drive";
import { digest } from "../src/security";
let mf: any,
  e: any,
  d: any,
  now: number,
  jwt: string,
  keys: any,
  files: Map<string, any>,
  serial = 0,
  invalidGrant = false,
  uploadFailures = 0,
  refunded = false,
  mediaRequests: string[] = [];
const site = "https://staging.example";
const realNow = Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
async function sha(bytes: Uint8Array) {
  return Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString(
    "hex",
  );
}
async function fakeFetch(input: any, options: any = {}) {
  const u = new URL(String(input)),
    method = options.method || "GET";
  if (u.hostname === "oauth2.googleapis.com") {
    if (u.pathname === "/revoke") return new Response("", { status: 200 });
    if (invalidGrant)
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json({
      access_token: "fake-google-access-token",
      refresh_token: "fake-google-refresh-token",
      scope: "https://www.googleapis.com/auth/drive.file",
    });
  }
  if (u.hostname === "api.stripe.com") {
    if (u.pathname === "/v1/account")
      return Response.json({ id: e.STRIPE_ACCOUNT_ID });
    const id = u.pathname.split("/").pop()!;
    if (u.pathname === "/v1/checkout/sessions") {
      const order = u.searchParams.get("payment_intent")!.slice(3);
      return Response.json({
        has_more: false,
        data: [
          {
            id: "cs_" + order,
            payment_intent: "pi_" + order,
            livemode: e.APP_ENV === "production",
            metadata: { order_id: order, quote_hash: "fixture-quote" },
            amount_subtotal: 19900,
            currency: "usd",
          },
        ],
      });
    }
    if (u.pathname.includes("checkout/sessions/")) {
      const order = id.slice(3);
      return Response.json({
        id,
        livemode: e.APP_ENV === "production",
        payment_status: "paid",
        status: "complete",
        metadata: { order_id: order, quote_hash: "fixture-quote" },
        amount_subtotal: 19900,
        amount_total: 19900,
        currency: "usd",
        customer_details: { email: "purchaser@example.test" },
        payment_intent: "pi_" + order,
      });
    }
    if (u.pathname.includes("payment_intents/"))
      return Response.json({ latest_charge: "ch_" + id.slice(3) });
    if (u.pathname.includes("charges/"))
      return Response.json({
        livemode: e.APP_ENV === "production",
        id,
        payment_intent: "pi_" + id.slice(3),
        currency: "usd",
        refunded,
        disputed: false,
        amount_refunded: refunded ? 19900 : 0,
      });
  }
  if (u.pathname.includes("generateIds"))
    return Response.json({ ids: ["drive-" + ++serial] });
  if (u.pathname.startsWith("/upload/drive/v3/files/")) {
    const id = u.pathname.split("/").pop()!;
    if (method === "PATCH")
      return new Response(null, {
        status: 200,
        headers: {
          Location: `https://www.googleapis.com/upload/drive/v3/files/${id}?upload_id=test`,
        },
      });
    if (uploadFailures > 0) {
      uploadFailures--;
      throw Error("simulated upload interruption");
    }
    const body = new Uint8Array(await new Response(options.body).arrayBuffer());
    const f = files.get(id);
    Object.assign(f, {
      body,
      size: String(body.length),
      sha256Checksum: await sha(body),
      headRevisionId: "revision-1",
    });
    return Response.json(f);
  }
  if (u.pathname === "/drive/v3/files" && method === "POST") {
    const b = JSON.parse(options.body);
    if (files.has(b.id)) return new Response(null, { status: 409 });
    files.set(b.id, {
      ...b,
      ownedByMe: true,
      shared: false,
      trashed: false,
      size: "0",
    });
    return Response.json({ id: b.id });
  }
  const match = u.pathname.match(
    /^\/drive\/v3\/files\/([^/]+)(?:\/revisions\/([^/]+))?$/,
  );
  if (match) {
    const f = files.get(match[1]);
    if (!f) return new Response(null, { status: 404 });
    if (method === "DELETE") {
      files.delete(match[1]);
      return new Response(null, { status: 204 });
    }
    if (match[2] && method === "PATCH") {
      f.pinned = new Uint8Array(f.body);
      return Response.json({ id: match[2], keepForever: true });
    }
    if (u.searchParams.get("alt") === "media") {
      mediaRequests.push(u.pathname);
      const body = f.pinned || f.body;
      const range = new Headers(options.headers).get("Range");
      if (range) {
        const m = range.match(/^bytes=(\d+)-(\d*)$/)!;
        const start = Number(m[1]),
          end = m[2]
            ? Math.min(Number(m[2]), body.length - 1)
            : body.length - 1;
        if (start >= body.length) return new Response(null, { status: 416 });
        return new Response(body.slice(start, end + 1), {
          status: 206,
          headers: {
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${body.length}`,
          },
        });
      }
      return new Response(body, {
        headers: { "Content-Length": String(body.length) },
      });
    }
    return Response.json(f);
  }
  throw Error("Unexpected fake request");
}
const call = (
  path: string,
  method = "GET",
  body?: any,
  admin = true,
  cookie = "",
  headers: any = {},
) =>
  deliveryRoute(
    new Request(e.PUBLIC_SITE_ORIGIN + path, {
      method,
      headers: {
        Origin: e.PUBLIC_SITE_ORIGIN,
        ...(admin ? { "Cf-Access-Jwt-Assertion": jwt } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body && typeof body !== "string" && !(body instanceof Uint8Array)
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string" || body instanceof Uint8Array
            ? body
            : JSON.stringify(body),
    }),
    e,
    d,
  );
async function order(paid = true) {
  const id = crypto.randomUUID();
  await e.DB.prepare(
    "INSERT INTO orders(id,token_hash,sku,cart,customer,subtotal,status,created_at,expires_at,updated_at,paid_at,paid_total,stripe_session_id,stripe_invoice_id) VALUES (?,?,'p6_audit','{}',?,19900,?,?,?,?,?,19900,?,?)",
  )
    .bind(
      id,
      await digest("unused"),
      JSON.stringify({ email: "initial@example.test" }),
      paid ? "PAID" : "DRAFT",
      now,
      now + 43200,
      now,
      paid ? now : null,
      "cs_" + id,
      "in_test",
    )
    .run();
  if (paid) {
    await e.DB.prepare(
      "UPDATE orders SET quote_hash='fixture-quote',consent_version='fixture-v1',consent_at=? WHERE id=?",
    )
      .bind(now, id)
      .run();
    await e.DB.prepare(
      "INSERT INTO agreement_acceptances(order_id,agreement_version,agreement_sha256,agreement_status,documents_url,scope_json,quote_sha256,portal_accepted_at,stripe_session_id,stripe_terms_status,stripe_verified_at,stripe_event_id) VALUES (?,'fixture-v1','fixture-hash','DRAFT','/fixture','{}','fixture-quote',?,?,'ACCEPTED',?,'evt_fixture')",
    )
      .bind(id, now, "cs_" + id, now)
      .run();
  }
  return id;
}
async function source(id: string) {
  const original = await e.DB.prepare("SELECT status FROM orders WHERE id=?")
    .bind(id)
    .first();
  await e.DB.prepare("UPDATE orders SET status='DRAFT' WHERE id=?")
    .bind(id)
    .run();
  const f = crypto.randomUUID(),
    key = "temp/" + id + "/" + f;
  const body = enc.encode("ERMHDR\t20\tsynthetic input");
  await e.DB.prepare(
    "INSERT INTO order_files(id,order_id,r2_key,name,mime,category,bytes,state,created_at,expires_at) VALUES (?,?,?,'source.xer','text/plain','xer',?,'READY',?,?)",
  )
    .bind(f, id, key, body.length, now, now + 43200)
    .run();
  await e.DB.prepare("UPDATE orders SET status=? WHERE id=?")
    .bind(original.status, id)
    .run();
  await e.UPLOADS.put(key, body);
  return { f, key, body };
}
async function final(
  id: string,
  name = "final.xer",
  body = enc.encode("ERMHDR\t20\tsynthetic final"),
) {
  const r = await call(
    `/api/v1/admin/orders/${id}/delivery/files`,
    "POST",
    body,
    true,
    "",
    { "Content-Length": String(body.length), "X-File-Name": name },
  );
  assert.equal(r.status, 201, await r.clone().text());
  return (await r.json()) as any;
}
async function approve(id: string, f: any) {
  const r = await call(`/api/v1/admin/orders/${id}/delivery/approve`, "POST", {
    fileId: f.id,
    sha256: f.sha256,
    clean: true,
    scanReference: "TEST scanner 2026-10-30 report fixture",
  });
  assert.equal(r.status, 200, await r.clone().text());
}
async function publish(id: string, f: any, passcode = false) {
  const r = await call(`/api/v1/admin/orders/${id}/delivery/publish`, "POST", {
    confirmOrder: id,
    invoiceReviewed: true,
    files: [{ id: f.id, sha256: f.sha256 }],
    accessDays: 30,
    retentionDays: 90,
    passcode,
  });
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()) as any;
}
async function activate(inv: any, passcode = inv.passcode) {
  return call(
    "/api/v1/delivery/activate",
    "POST",
    {
      invite: new URLSearchParams(new URL(inv.url).hash.slice(1)).get("invite"),
      passcode,
    },
    false,
  );
}
before(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: "2026-10-28",
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
  });
  const pair = await generateKeyPair("RS256");
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = "delivery-test";
  keys = createLocalJWKSet({ keys: [jwk] });
  jwt = await new SignJWT({ email: "owner@example.test" })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer("https://test.cloudflareaccess.com")
    .setAudience("test-aud")
    .setExpirationTime(realNow + 86400)
    .sign(pair.privateKey);
  e = {
    DB: await mf.getD1Database("DB"),
    UPLOADS: await mf.getR2Bucket("UPLOADS"),
    APP_ENV: "test",
    PORTAL_ENABLED: "false",
    PUBLIC_SITE_ORIGIN: site,
    ALLOWED_ORIGINS: site,
    ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ADMIN_EMAILS: "owner@example.test",
    RATE_LIMIT_SALT: "s".repeat(64),
    DRIVE_ENABLED: "true",
    DELIVERY_ENABLED: "true",
    DELIVERY_POLICY_APPROVED: "true",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "fake-client-secret",
    DRIVE_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_ACCOUNT_ID: "acct_fixture",
  };
  for (const file of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await e.DB.exec(
      readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8")
        .replace(/^--.*$/gm, "")
        .replace(/\n/g, " "),
    );
});
after(async () => await mf.dispose());
beforeEach(async () => {
  now = realNow;
  Object.assign(e, {
    APP_ENV: "test",
    PUBLIC_SITE_ORIGIN: site,
    ALLOWED_ORIGINS: site,
    STRIPE_ACCOUNT_ID: "acct_fixture",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    LEGAL_APPROVED: "false",
  });
  files = new Map();
  serial = 0;
  invalidGrant = false;
  uploadFailures = 0;
  refunded = false;
  mediaRequests = [];
  d = { now: () => now, fetch: fakeFetch, adminKeys: keys };
  e.DRIVE_ENABLED = "true";
  e.DELIVERY_ENABLED = "true";
  e.DELIVERY_POLICY_APPROVED = "true";
  for (const table of [
    "delivery_sessions",
    "delivery_invites",
    "delivery_members",
    "deliveries",
    "delivery_files",
    "drive_jobs",
    "drive_projects",
    "drive_nodes",
    "drive_credentials",
    "drive_oauth_states",
    "notifications",
    "payment_events",
    "payment_refund_events",
    "payment_refund_holds",
    "payment_refund_checks",
    "agreement_acceptances",
    "audit_events",
    "order_files",
    "orders",
    "rate_limits",
  ])
    await e.DB.prepare("DELETE FROM " + table).run();
  await e.DB.prepare(
    "INSERT INTO drive_credentials(id,refresh_cipher,status,updated_at) VALUES (1,?,'CONNECTED',?)",
  )
    .bind(await seal(e, "fake-google-refresh-token", "drive-refresh"), now)
    .run();
});
test("OAuth encrypted storage, context binding and state/PKCE one-use callback", async () => {
  const sealed = await seal(e, "test-secret", "drive-refresh");
  assert.ok(!sealed.includes("test-secret"));
  assert.equal(await unseal(e, sealed, "drive-refresh"), "test-secret");
  await assert.rejects(() => unseal(e, sealed, "oauth-pkce"));
  assert.equal(
    (await call("/api/v1/admin/drive/oauth/start", "POST", {}, false)).status,
    401,
  );
  const start = await call("/api/v1/admin/drive/oauth/start", "POST", {});
  const b: any = await start.json(),
    url = new URL(b.authorizationUrl);
  assert.equal(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/drive.file",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const state = url.searchParams.get("state")!;
  const row = await e.DB.prepare("SELECT * FROM drive_oauth_states").first();
  assert.ok(!JSON.stringify(row).includes(state));
  const path =
    "/api/v1/admin/drive/oauth/callback?state=" + state + "&code=fake-code";
  const callback = await call(
    path,
    "GET",
    undefined,
    true,
    start.headers.get("set-cookie")!.split(";")[0],
  );
  assert.equal(callback.status, 303);
  assert.equal(
    (
      await call(
        path,
        "GET",
        undefined,
        true,
        start.headers.get("set-cookie")!.split(";")[0],
      )
    ).status,
    403,
  );
});
test("invalid_grant pauses authorization; reconnect/revoke never exposes refresh token", async () => {
  invalidGrant = true;
  await assert.rejects(() => access(e, d), /drive_reauthorization_required/);
  assert.equal(
    (await e.DB.prepare("SELECT status FROM drive_credentials").first()).status,
    "REAUTH_REQUIRED",
  );
  invalidGrant = false;
  const r = await call("/api/v1/admin/drive/oauth/revoke", "POST", {});
  assert.equal(r.status, 200);
  assert.equal(
    await e.DB.prepare("SELECT id FROM drive_credentials").first(),
    null,
  );
});
test("paid-only durable transfer preserves SHA256, leases, private folders and idempotency", async () => {
  const paid = await order(),
    unpaid = await order(false);
  const src = await source(paid);
  await source(unpaid);
  await enqueue(e, d);
  await enqueue(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM drive_jobs").first()).n,
    1,
  );
  await transfer(e, d);
  const job = await e.DB.prepare("SELECT * FROM drive_jobs").first();
  assert.equal(job.state, "VERIFIED");
  assert.equal(job.sha256, await sha(src.body));
  const count = files.size;
  await transfer(e, d);
  assert.equal(files.size, count);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT expires_at-created_at n FROM orders WHERE id=?",
      )
        .bind(paid)
        .first()
    ).n,
    43200,
  );
  assert.ok([...files.values()].every((f) => f.shared === false));
});
test("transfer interruption retries same Drive ID; source expiry never extends R2 TTL", async () => {
  const id = await order();
  await source(id);
  uploadFailures = 1;
  await transfer(e, d);
  let job = await e.DB.prepare("SELECT * FROM drive_jobs").first();
  assert.equal(job.state, "RETRY");
  const size = files.size;
  now += 61;
  await transfer(e, d);
  job = await e.DB.prepare("SELECT * FROM drive_jobs").first();
  assert.equal(job.state, "VERIFIED");
  assert.equal(files.size, size);
  const other = await order();
  await source(other);
  await enqueue(e, d);
  now += 43201;
  await transfer(e, d);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT state,error_code FROM drive_jobs WHERE order_id=?",
      )
        .bind(other)
        .first()
    ).error_code,
    "source_expired",
  );
});
test("admin scanned release, one-use invitation, secure cookie and pinned range streaming", async () => {
  const id = await order();
  const f = await final(id);
  const notApproved = await call(
    `/api/v1/admin/orders/${id}/delivery/publish`,
    "POST",
    {
      confirmOrder: id,
      invoiceReviewed: true,
      files: [f],
      accessDays: 30,
      retentionDays: 90,
    },
  );
  assert.equal(notApproved.status, 409);
  await approve(id, f);
  const inv = await publish(id, f);
  assert.equal(inv.recipient, "purchaser@example.test");
  const r = await activate(inv);
  assert.equal(r.status, 200, await r.clone().text());
  const header = r.headers.get("set-cookie")!;
  assert.match(header, /Secure; HttpOnly; SameSite=Strict/);
  const c = header.split(";")[0];
  assert.equal((await activate(inv)).status, 401);
  const listed = await call(
    "/api/v1/delivery/files",
    "GET",
    undefined,
    false,
    c,
  );
  const listing = await listed.text();
  assert.ok(!listing.includes("drive-"));
  assert.ok(!listing.includes("google"));
  const download = await call(
    `/api/v1/delivery/files/${f.id}/download`,
    "GET",
    undefined,
    false,
    c,
    { Range: "bytes=0-5" },
  );
  assert.equal(download.status, 206);
  assert.equal(await download.text(), "ERMHDR");
  assert.ok(mediaRequests[0].includes("/revisions/"));
  assert.equal(download.headers.get("Cache-Control"), "private, no-store");
  assert.equal(
    (
      await call(
        "/api/v1/delivery/files/" + crypto.randomUUID() + "/download",
        "GET",
        undefined,
        false,
        c,
      )
    ).status,
    404,
  );
});
test("optional independent passcode, concurrent activation and forged invite rejection", async () => {
  const id = await order();
  const f = await final(id);
  await approve(id, f);
  const inv = await publish(id, f, true);
  assert.equal((await activate(inv, "wrong")).status, 401);
  const results = await Promise.all([activate(inv), activate(inv)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  const forged = await call(
    "/api/v1/delivery/activate",
    "POST",
    { invite: "a".repeat(64) },
    false,
  );
  assert.equal(forged.status, 401);
});
test("delivery session never crosses orders, regeneration and revoke invalidate old access", async () => {
  const first = await order(),
    second = await order();
  const a = await final(first),
    b = await final(second);
  await approve(first, a);
  await approve(second, b);
  const inv = await publish(first, a);
  const active = await activate(inv),
    c = active.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (
      await call(
        `/api/v1/delivery/files/${b.id}/download`,
        "GET",
        undefined,
        false,
        c,
      )
    ).status,
    404,
  );
  const regenerated = await call(
    `/api/v1/admin/orders/${first}/delivery/regenerate`,
    "POST",
    {},
  );
  assert.equal(regenerated.status, 200);
  assert.equal(
    (await call("/api/v1/delivery/files", "GET", undefined, false, c)).status,
    401,
  );
  const fresh: any = await regenerated.json();
  await call(`/api/v1/admin/orders/${first}/delivery/revoke`, "POST", {});
  assert.equal((await activate(fresh)).status, 401);
});
test("changed/shared finals, refunds, policy gate and origin CSRF cannot be published", async () => {
  const id = await order(),
    f = await final(id);
  const wrong = await call(
    `/api/v1/admin/orders/${id}/delivery/approve`,
    "POST",
    {
      fileId: f.id,
      sha256: "bad",
      clean: true,
      scanReference: "test scan fixture",
    },
  );
  assert.equal(wrong.status, 409);
  await approve(id, f);
  const body = {
    confirmOrder: id,
    invoiceReviewed: true,
    files: [{ id: f.id, sha256: f.sha256 }],
    accessDays: 30,
    retentionDays: 90,
  };
  e.DELIVERY_POLICY_APPROVED = "false";
  assert.equal(
    (await call(`/api/v1/admin/orders/${id}/delivery/publish`, "POST", body))
      .status,
    503,
  );
  e.DELIVERY_POLICY_APPROVED = "true";
  const row = await e.DB.prepare(
    "SELECT drive_id FROM delivery_files WHERE id=?",
  )
    .bind(f.id)
    .first();
  files.get(row.drive_id).shared = true;
  assert.equal(
    (await call(`/api/v1/admin/orders/${id}/delivery/publish`, "POST", body))
      .status,
    409,
  );
  refunded = true;
  assert.equal(
    (await call(`/api/v1/admin/orders/${id}/delivery/publish`, "POST", body))
      .status,
    403,
  );

  assert.equal(
    (
      await call("/api/v1/delivery/activate", "POST", {}, false, "", {
        Origin: "https://evil.test",
      })
    ).status,
    403,
  );
});
test("delivery outlives 12h input TTL but expires independently; retention respects policy gate", async () => {
  const id = await order(),
    f = await final(id);
  await approve(id, f);
  const inv = await publish(id, f);
  now += 13 * 3600;
  const active = await activate(inv);
  assert.equal(active.status, 200);
  const c = active.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await call("/api/v1/delivery/files", "GET", undefined, false, c)).status,
    200,
  );
  now += 3601;
  assert.equal(
    (await call("/api/v1/delivery/files", "GET", undefined, false, c)).status,
    401,
  );
  now = realNow + 91 * 86400;
  e.DELIVERY_POLICY_APPROVED = "false";
  await deliveryMaintenance(e, d);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT purged_at FROM drive_projects WHERE order_id=?",
      )
        .bind(id)
        .first()
    ).purged_at,
    null,
  );
  e.DELIVERY_POLICY_APPROVED = "true";
  await deliveryMaintenance(e, d);
  assert.ok(
    (
      await e.DB.prepare(
        "SELECT purged_at FROM drive_projects WHERE order_id=?",
      )
        .bind(id)
        .first()
    ).purged_at,
  );
});
test("delivery feature is fail-closed without changing the intake enable flag", async () => {
  e.DELIVERY_ENABLED = "false";
  assert.equal(
    (await call("/api/v1/delivery/files", "GET", undefined, false)).status,
    503,
  );
  assert.equal(e.PORTAL_ENABLED, "false");
  assert.equal(
    (await call("/api/v1/admin/drive/status", "GET", undefined, false)).status,
    401,
  );
});

test("Drive login return requires admin and uses a fixed same-origin target", async () => {
  assert.equal(
    (await call("/api/v1/admin/drive/login", "GET", undefined, false)).status,
    401,
  );
  const result = await call(
    "/api/v1/admin/drive/login?next=https://evil.example",
  );
  assert.equal(result.status, 303);
  assert.equal(
    result.headers.get("Location"),
    site + "/admin/#drive-connection",
  );
});

test("PAID lock and real payment recheck gate transfer including paid re-uploads", async () => {
  const parent = await order(),
    child = await order();
  await e.DB.prepare(
    "UPDATE orders SET parent_id=?,stripe_session_id=NULL,status='DRAFT' WHERE id=?",
  )
    .bind(parent, child)
    .run();
  await source(child);
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM drive_jobs").first()).n,
    0,
  );
  await e.DB.prepare("UPDATE orders SET status='PAID' WHERE id=?")
    .bind(child)
    .run();
  refunded = true;
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT error_code FROM drive_jobs").first())
      .error_code,
    "payment_on_hold",
  );
  assert.equal(files.size, 0);
  refunded = false;
  now += 61;
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT state FROM drive_jobs").first()).state,
    "VERIFIED",
  );
});

test("disconnection, invalid refresh and quota errors are durable and recover without duplicate jobs", async () => {
  const id = await order();
  await source(id);
  await e.DB.prepare(
    "UPDATE drive_credentials SET status='REAUTH_REQUIRED'",
  ).run();
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT state FROM drive_jobs").first()).state,
    "RETRY",
  );
  await e.DB.prepare("UPDATE drive_credentials SET status='CONNECTED'").run();
  now += 61;
  invalidGrant = true;
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT status FROM drive_credentials").first()).status,
    "REAUTH_REQUIRED",
  );
  invalidGrant = false;
  await e.DB.prepare("UPDATE drive_credentials SET status='CONNECTED'").run();
  now += 121;
  const network = d.fetch;
  d.fetch = async (url: any, options: any) =>
    String(url).includes("googleapis.com/drive/v3/")
      ? new Response("{}", { status: 403 })
      : network(url, options);
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT error_code FROM drive_jobs").first())
      .error_code,
    "drive_quota_or_permission",
  );
  const status: any = await (await call("/api/v1/admin/drive/status")).json();
  assert.equal(status.alerts.length, 1);
  assert.equal(status.alerts[0].error_code, "drive_quota_or_permission");
  d.fetch = network;
  now += 241;
  await transfer(e, d);
  const job = await e.DB.prepare(
    "SELECT state,attempts FROM drive_jobs",
  ).first();
  assert.equal(job.state, "VERIFIED");
  assert.equal(job.attempts, 4);
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM drive_jobs").first()).n,
    1,
  );
  assert.equal(
    ((await (await call("/api/v1/admin/drive/status")).json()) as any).alerts
      .length,
    0,
  );
});

test("private parent folder is checked again before a subsequent transfer", async () => {
  const id = await order();
  await source(id);
  await transfer(e, d);
  const p = await e.DB.prepare("SELECT * FROM drive_projects WHERE order_id=?")
    .bind(id)
    .first();
  files.get(p.uploads_id).shared = true;
  await source(id);
  await transfer(e, d);
  const j = await e.DB.prepare(
    "SELECT error_code FROM drive_jobs WHERE state='RETRY'",
  ).first();
  assert.equal(j.error_code, "drive_file_not_private");
  files.get(p.uploads_id).shared = false;
  now += 61;
  await transfer(e, d);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT COUNT(*) n FROM drive_jobs WHERE state='VERIFIED'",
      ).first()
    ).n,
    2,
  );
});

test("real-format synthetic PDF XLSX XER bytes roundtrip with no customer provider identifiers", async () => {
  const id = await order();
  for (const ext of ["pdf", "xlsx", "xer"]) {
    const bytes = new Uint8Array(
      readFileSync(
        new URL(
          "../../../tests/fixtures/drive/synthetic." + ext,
          import.meta.url,
        ),
      ),
    );
    const f = await final(id, "synthetic." + ext, bytes);
    await approve(id, f);
    const inv = await publish(id, f);
    const a = await activate(inv);
    const cookie = a.headers.get("set-cookie")!.split(";")[0];
    const list = await call(
      "/api/v1/delivery/files",
      "GET",
      undefined,
      false,
      cookie,
    );
    const text = await list.text();
    assert.ok(
      !/drive_id|googleapis|drive\.google|refresh|revision_id/.test(text),
    );
    const result = await call(
      "/api/v1/delivery/files/" + f.id + "/download",
      "GET",
      undefined,
      false,
      cookie,
    );
    assert.equal(result.status, 200);
    const actual = new Uint8Array(await result.arrayBuffer());
    assert.equal(actual.length, bytes.length);
    assert.equal(await sha(actual), await sha(bytes));
  }
  const adminStatus: any = await (
    await call("/api/v1/admin/orders/" + id + "/delivery")
  ).json();
  assert.equal(adminStatus.downloads.count, 3);
  assert.equal(adminStatus.order.status, "PAID");
});

test("simulated exact 30-day access and 90-day archive boundaries; expiry is not elapsed-time proof", async () => {
  const start = now,
    id = await order(),
    f = await final(id);
  await approve(id, f);
  await publish(id, f);
  const row: any = await e.DB.prepare(
    "SELECT expires_at FROM deliveries WHERE order_id=?",
  )
    .bind(id)
    .first();
  const p: any = await e.DB.prepare(
    "SELECT * FROM drive_projects WHERE order_id=?",
  )
    .bind(id)
    .first();
  assert.equal(row.expires_at, start + 30 * 86400);
  assert.equal(p.retention_at, start + 90 * 86400);
  now = start + 30 * 86400 - 1;
  const invitation: any = await (
    await call(
      "/api/v1/admin/orders/" + id + "/delivery/regenerate",
      "POST",
      {},
    )
  ).json();
  const active = await activate(invitation),
    cookie = active.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await call("/api/v1/delivery/files", "GET", undefined, false, cookie))
      .status,
    200,
  );
  now++;
  assert.equal(
    (await call("/api/v1/delivery/files", "GET", undefined, false, cookie))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/v1/admin/orders/" + id + "/delivery/regenerate",
        "POST",
        {},
      )
    ).status,
    409,
  );
  now = start + 90 * 86400 - 1;
  await deliveryMaintenance(e, d);
  assert.ok(files.has(p.folder_id));
  now++;
  e.DELIVERY_POLICY_APPROVED = "false";
  await deliveryMaintenance(e, d);
  assert.ok(files.has(p.folder_id));
  e.DELIVERY_POLICY_APPROVED = "true";
  await deliveryMaintenance(e, d);
  assert.equal(files.has(p.folder_id), false);
  await deliveryMaintenance(e, d);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT COUNT(*) n FROM audit_events WHERE action='drive_retention_deleted'",
      ).first()
    ).n,
    1,
  );
});

test("unconsumed invitation expires at 24 hours; missing cookie cannot download", async () => {
  const id = await order(),
    f = await final(id);
  await approve(id, f);
  const inv = await publish(id, f);
  now += 86400;
  assert.equal((await activate(inv)).status, 401);
  assert.equal(
    (
      await call(
        "/api/v1/delivery/files/" + f.id + "/download",
        "GET",
        undefined,
        false,
      )
    ).status,
    401,
  );
});

test("retention retry recovers provider-deleted folder without restoring customer access", async () => {
  const id = await order(),
    f = await final(id);
  await approve(id, f);
  await publish(id, f);
  const p: any = await e.DB.prepare(
    "SELECT * FROM drive_projects WHERE order_id=?",
  )
    .bind(id)
    .first();
  files.delete(p.folder_id);
  now += 91 * 86400;
  await deliveryMaintenance(e, d);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT purged_at FROM drive_projects WHERE order_id=?",
      )
        .bind(id)
        .first()
    ).purged_at,
    now,
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM deliveries WHERE order_id=?")
        .bind(id)
        .first()
    ).status,
    "EXPIRED",
  );
});

test("integrity mismatch is retried, never marked verified, and lease prevents duplicate workers", async () => {
  const id = await order();
  await source(id);
  await enqueue(e, d);
  await e.DB.prepare("UPDATE drive_jobs SET state='RUNNING',lease_until=?")
    .bind(now + 600)
    .run();
  await transfer(e, d);
  assert.equal(files.size, 0);
  now += 601;
  const original = d.fetch;
  d.fetch = async (url: any, options: any) => {
    const r = await original(url, options);
    if (String(url).includes("fields=id,size") && r.ok) {
      const m = await r.json();
      if (m.sha256Checksum) m.sha256Checksum = "0".repeat(64);
      return Response.json(m);
    }
    return r;
  };
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT error_code FROM drive_jobs").first())
      .error_code,
    "drive_integrity_unverified",
  );
  d.fetch = original;
  now += 61;
  await transfer(e, d);
  assert.equal(
    (await e.DB.prepare("SELECT state FROM drive_jobs").first()).state,
    "VERIFIED",
  );
});

test("controlled reupload window remains capability protected, expires, and never opens new intake", async () => {
  const id = await order();
  const config: any = {
    ...e,
    STRIPE_SECRET_KEY: "sk_test_fixture123",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture_123456",
    TURNSTILE_SECRET_KEY: "test",
    STAGING_REUPLOAD_TEST_ORDER: id,
    STAGING_REUPLOAD_TEST_UNTIL: String(Math.floor(Date.now() / 1000) + 600),
  };
  const req = (path: string) =>
    new Request(site + path, { headers: { Origin: site } });
  assert.equal(
    (await staging.fetch(req("/api/v1/orders/" + id + "/status"), config))
      .status,
    401,
  );
  assert.equal(
    (
      await staging.fetch(
        req("/api/v1/orders/" + crypto.randomUUID() + "/status"),
        config,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await staging.fetch(
        new Request(site + "/api/v1/orders", {
          method: "POST",
          headers: { Origin: site },
        }),
        config,
      )
    ).status,
    503,
  );
  config.STAGING_REUPLOAD_TEST_UNTIL = "1";
  assert.equal(
    (await staging.fetch(req("/api/v1/orders/" + id + "/status"), config))
      .status,
    503,
  );
  config.STAGING_REUPLOAD_TEST_UNTIL = String(
    Math.floor(Date.now() / 1000) + 3600,
  );
  assert.equal(
    (await staging.fetch(req("/api/v1/orders/" + id + "/status"), config))
      .status,
    503,
  );
});

test("admin physical archive check is independent from delivery expiry and requires authorization", async () => {
  const id = await order(),
    f = await final(id);
  await approve(id, f);
  await publish(id, f);
  const path = "/api/v1/admin/orders/" + id + "/delivery/archive-check";
  assert.equal((await call(path, "GET", undefined, false)).status, 401);
  assert.equal((await call(path)).status, 409);
  now += 91 * 86400;
  await deliveryMaintenance(e, d);
  const incomplete: any = await (await call(path)).json();
  assert.equal(incomplete.allAbsent, false); // mock deliberately leaves children behind
  files.clear();
  const complete: any = await (await call(path)).json();
  assert.equal(complete.allAbsent, true);
  assert.ok(complete.checked >= 6);
});

test("historical PAID without D1 consent cannot enqueue or upload deliverables", async () => {
  const id = await order();
  await source(id);
  await e.DB.prepare("DELETE FROM agreement_acceptances WHERE order_id=?")
    .bind(id)
    .run();
  await enqueue(e, d);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT count(*) AS n FROM drive_jobs WHERE order_id=?",
      )
        .bind(id)
        .first()
    ).n,
    0,
  );
  const r = await call(
    "/api/v1/admin/orders/" + id + "/delivery/files",
    "POST",
    "synthetic",
  );
  assert.equal(r.status, 403);
});

for (const mode of ["test", "production"])
  test(`${mode} signed refund webhook revokes sessions and invites idempotently without changing retention or consent`, async () => {
    if (mode === "production") liveFixture();
    const id = await order(),
      f = await final(id);
    await approve(id, f);
    const inv = await publish(id, f);
    const active = await activate(inv);
    const cookie = active.headers.get("set-cookie")!.split(";")[0];
    const before: any = await e.DB.prepare(
      "SELECT retention_at FROM drive_projects WHERE order_id=?",
    )
      .bind(id)
      .first();
    const release: any = await e.DB.prepare(
      "SELECT version FROM deliveries WHERE order_id=?",
    )
      .bind(id)
      .first();
    refunded = true;
    e.STRIPE_WEBHOOK_SECRET = "fixture-webhook-secret";
    const event = {
      id: "evt_refund_fixture",
      type: "charge.refunded",
      livemode: mode === "production",
      data: { object: { id: "ch_" + id } },
    };
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
        new TextEncoder().encode(now + "." + raw),
      ),
    ).toString("hex");
    const request = (signature: string) =>
      new Request(site + "/api/v1/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: raw,
      });
    await assert.rejects(() => webhook(request("t=" + now + ",v1=bad"), e, d));
    const run = () => webhook(request("t=" + now + ",v1=" + sig), e, d);
    assert.equal((await run()).refundOrders, 1);
    await run();
    assert.equal(
      (
        await call(
          "/api/v1/delivery/files/" + f.id + "/download",
          "GET",
          undefined,
          false,
          cookie,
        )
      ).status,
      401,
    );
    assert.equal((await activate(inv)).status, 401);
    assert.equal(
      (
        await e.DB.prepare("SELECT version FROM deliveries WHERE order_id=?")
          .bind(id)
          .first()
      ).version,
      release.version + 1,
    );
    assert.equal(
      (
        await e.DB.prepare(
          "SELECT retention_at FROM drive_projects WHERE order_id=?",
        )
          .bind(id)
          .first()
      ).retention_at,
      before.retention_at,
    );
    assert.equal(
      (
        await e.DB.prepare(
          "SELECT count(*) n FROM payment_refund_events",
        ).first()
      ).n,
      1,
    );
    assert.equal(
      (
        await e.DB.prepare(
          "SELECT stripe_terms_status FROM agreement_acceptances WHERE order_id=?",
        )
          .bind(id)
          .first()
      ).stripe_terms_status,
      "ACCEPTED",
    );
    assert.equal(
      (
        await call(
          "/api/v1/admin/orders/" + id + "/delivery/regenerate",
          "POST",
          { passcode: true },
        )
      ).status,
      403,
    );
  });
test("refund fallback blocks existing download without webhook; Stripe outage releases no file bytes", async () => {
  const id = await order(),
    f = await final(id);
  await approve(id, f);
  const inv = await publish(id, f);
  const a = await activate(inv);
  const c = a.headers.get("set-cookie")!.split(";")[0];
  const normal = d.fetch;
  d.fetch = async (input: any, options: any) =>
    String(input).includes("api.stripe.com")
      ? new Response("", { status: 503 })
      : normal(input, options);
  const failed = await call(
    "/api/v1/delivery/files/" + f.id + "/download",
    "GET",
    undefined,
    false,
    c,
  );
  assert.ok(failed.status >= 500);
  d.fetch = normal;
  refunded = true;
  const r = await call(
    "/api/v1/delivery/files/" + f.id + "/download",
    "GET",
    undefined,
    false,
    c,
  );
  assert.equal(r.status, 403);
  assert.equal(((await r.json()) as any).error, "payment_refunded");
  assert.equal(
    (await e.DB.prepare("SELECT count(*) n FROM delivery_sessions").first()).n,
    0,
  );
});
test("partial refund revokes child reupload deliveries and Cron fallback preserves cleanup eligibility", async () => {
  const parent = await order(),
    child = await order();
  await e.DB.prepare("UPDATE orders SET parent_id=? WHERE id=?")
    .bind(parent, child)
    .run();
  const f = await final(child);
  await approve(child, f);
  await publish(child, f);
  await applyRefund(e, d, parent, {
    id: "ch_" + parent,
    livemode: false,
    currency: "usd",
    amount_refunded: 100,
  });
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM deliveries WHERE order_id=?")
        .bind(child)
        .first()
    ).status,
    "REVOKED",
  );
  const another = await order(),
    g = await final(another);
  await approve(another, g);
  await publish(another, g);
  refunded = true;
  await reconcileRefunds(e, d);
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM deliveries WHERE order_id=?")
        .bind(another)
        .first()
    ).status,
    "REVOKED",
  );
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT hold_reason FROM drive_projects WHERE order_id=?",
      )
        .bind(another)
        .first()
    ).hold_reason,
    null,
  );
});

test("refund hold prevents stale publish race and late paid snapshot from restoring access", async () => {
  const id = await order(),
    f = await final(id);
  await approve(id, f);
  await publish(id, f);
  await applyRefund(e, d, id, {
    id: "ch_" + id,
    livemode: false,
    currency: "usd",
    amount_refunded: 100,
  });
  // Simulate a publish already in flight committing after the atomic refund batch.
  await e.DB.prepare(
    "UPDATE deliveries SET status='PUBLISHED' WHERE order_id=?",
  )
    .bind(id)
    .run();
  await assert.rejects(() => checkRefund(e, d, id), /payment_refunded/);
  assert.equal(
    (
      await e.DB.prepare("SELECT status FROM deliveries WHERE order_id=?")
        .bind(id)
        .first()
    ).status,
    "REVOKED",
  );
});

const liveSite =
  "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev";
function liveFixture() {
  Object.assign(e, {
    APP_ENV: "production",
    PUBLIC_SITE_ORIGIN: liveSite,
    ALLOWED_ORIGINS: liveSite,
    STRIPE_ACCOUNT_ID: LIVE_ACCOUNT_ID,
    STRIPE_SECRET_KEY: "rk_live_fixture",
    LEGAL_APPROVED: "true",
  });
}
test("production Drive OAuth routes preserve Access, same-origin, state and PKCE while intake stays closed", async () => {
  liveFixture();
  const api = production(d);
  const req = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    signed = true,
  ) =>
    new Request(liveSite + path, {
      method,
      headers: {
        ...(signed ? { "Cf-Access-Jwt-Assertion": jwt } : {}),
        ...(method === "POST"
          ? { Origin: liveSite, "Content-Type": "application/json" }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal(
    (
      await api.fetch(
        req("/api/v1/admin/drive/status", "GET", undefined, "", false),
        e,
      )
    ).status,
    401,
  );
  const status: any = await (
    await api.fetch(req("/api/v1/admin/drive/status"), e)
  ).json();
  assert.equal(status.mode, "production");
  assert.equal(status.configured, true);
  const start = await api.fetch(
    req("/api/v1/admin/drive/oauth/start", "POST", {}),
    e,
  );
  assert.equal(start.status, 200);
  const url = new URL(((await start.json()) as any).authorizationUrl);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    liveSite + "/api/v1/admin/drive/oauth/callback",
  );
  assert.equal(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/drive.file",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const callback =
    "/api/v1/admin/drive/oauth/callback?code=fixture&state=" +
    url.searchParams.get("state");
  const cookie = start.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await api.fetch(req(callback, "GET", undefined, cookie), e)).status,
    303,
  );
  assert.equal(
    (await api.fetch(req(callback, "GET", undefined, cookie), e)).status,
    403,
  );
  assert.equal(
    (await api.fetch(req("/api/v1/orders", "POST", {}), e)).status,
    503,
  );
  const wrong = { ...e, STRIPE_ACCOUNT_ID: "acct_1UVrQ3BxU4PsnoX0" };
  assert.equal(
    (await api.fetch(req("/api/v1/admin/drive/status"), wrong)).status,
    503,
  );
});
test("production transfer uses Live merchant/mode and private production root, preserving R2 TTL and one-use customer delivery", async () => {
  liveFixture();
  const id = await order(),
    src = await source(id);
  await assert.rejects(
    verifiedTransferPayment(
      { ...e, STRIPE_SECRET_KEY: "sk_test_fixture" },
      id,
      d,
    ),
    /verified_payment_required/,
  );
  const wrongMode = {
    ...d,
    fetch: async (u: any, o: any) => {
      const r = await fakeFetch(u, o);
      if (String(u).includes("/checkout/sessions/")) {
        const s: any = await r.json();
        s.livemode = false;
        return Response.json(s);
      }
      return r;
    },
  };
  await assert.rejects(
    verifiedTransferPayment(e, id, wrongMode),
    /verified_payment_required/,
  );
  await transfer(e, d);
  const job = await e.DB.prepare("SELECT * FROM drive_jobs").first();
  assert.equal(job.state, "VERIFIED");
  assert.equal(job.sha256, await sha(src.body));
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT COUNT(*) n FROM drive_nodes WHERE node_key='production-root'",
      ).first()
    ).n,
    1,
  );
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT COUNT(*) n FROM drive_nodes WHERE node_key='staging-root'",
      ).first()
    ).n,
    0,
  );
  const finalFile = await final(id);
  await approve(id, finalFile);
  const inv = await publish(id, finalFile);
  const activated = await activate(inv);
  assert.equal(activated.status, 200);
  assert.equal((await activate(inv)).status, 401);
  const cookie = activated.headers.get("set-cookie")!.split(";")[0];
  const download = await call(
    "/api/v1/delivery/files/" + finalFile.id + "/download",
    "GET",
    undefined,
    false,
    cookie,
  );
  assert.equal(download.status, 200);
  assert.equal(
    await sha(new Uint8Array(await download.arrayBuffer())),
    finalFile.sha256,
  );
  const listing = await call(
    "/api/v1/delivery/files",
    "GET",
    undefined,
    false,
    cookie,
  );
  assert.doesNotMatch(
    await listing.text(),
    /drive_id|googleapis|drive\.google|refresh_token/,
  );
  refunded = true;
  assert.equal(
    (
      await call(
        "/api/v1/delivery/files/" + finalFile.id + "/download",
        "GET",
        undefined,
        false,
        cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT expires_at-created_at n FROM orders WHERE id=?",
      )
        .bind(id)
        .first()
    ).n,
    43200,
  );
});
