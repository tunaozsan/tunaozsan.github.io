import {
  Problem,
  quote,
  packages,
  materials,
  object,
  keys,
  TTL,
  TERMS,
} from "./catalog";
import {
  type Env,
  type Deps,
  defaults,
  id,
  token,
  digest,
  equal,
  ready,
  enabled,
  admin,
  jsonBody,
  rate,
} from "./security";
import { upload, removeFile } from "./storage";
import { checkout, webhook, quoteOrder, stripe } from "./payments";
import { operations } from "./operations";
import { cleanup } from "./cleanup";
const json = (data: unknown, status = 200) => Response.json(data, { status });
function metadata(raw: unknown) {
  const v = object(raw);
  keys(v, ["name", "email", "project", "dataDate"]);
  for (const [k, max] of [
    ["name", 100],
    ["email", 254],
    ["project", 160],
    ["dataDate", 10],
  ] as const) {
    if (k === "dataDate" && !v[k]) continue;
    if (
      typeof v[k] !== "string" ||
      !v[k].trim() ||
      v[k].length > max ||
      /[\x00-\x1f]/.test(v[k])
    )
      throw new Problem(400, "invalid_customer");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
    throw new Problem(400, "invalid_email");
  if (v.dataDate && !/^\d{4}-\d{2}-\d{2}$/.test(v.dataDate))
    throw new Problem(400, "invalid_data_date");
  return {
    name: v.name.trim(),
    email: v.email.trim(),
    project: v.project.trim(),
    dataDate: v.dataDate || "",
  };
}
async function owner(req: Request, e: Env, orderId: string) {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!bearer) throw new Problem(401, "order_access_required");
  const o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(orderId)
    .first<any>();
  if (!o || !equal(o.token_hash, await digest(bearer)))
    throw new Problem(404, "order_not_found");
  return o;
}
const alive = (o: any, now: number) => {
  if (now >= o.expires_at) throw new Problem(410, "files_expired");
};
async function audit(
  e: Env,
  order: string,
  actor: string,
  action: string,
  now: number,
) {
  await e.DB.prepare(
    "INSERT INTO audit_events(order_id,actor,action,created_at) VALUES (?,?,?,?)",
  )
    .bind(order, actor, action, now)
    .run();
}
export function app(d: Deps = defaults) {
  return {
    async fetch(req: Request, e: Env): Promise<Response> {
      const requestId = id(),
        url = new URL(req.url),
        origin = req.headers.get("origin"),
        allowed = e.ALLOWED_ORIGINS.split(",").map((x) => x.trim());
      const isHook = url.pathname === "/api/v1/stripe/webhook";
      let res: Response;
      try {
        if (origin && !allowed.includes(origin))
          throw new Problem(403, "origin_denied");
        if (req.method === "OPTIONS") {
          if (!origin || isHook) throw new Problem(403, "origin_denied");
          res = new Response(null, { status: 204 });
        } else {
          if (!isHook && !["GET", "HEAD"].includes(req.method) && !origin)
            throw new Problem(403, "origin_required");
          res = await route(req, e, d, url);
        }
      } catch (err) {
        const p =
          err instanceof Problem ? err : new Problem(500, "request_failed");
        res = json({ error: p.code, requestId }, p.status);
      }
      const h = new Headers(res.headers);
      h.set("Cache-Control", "no-store");
      h.set("X-Content-Type-Options", "nosniff");
      h.set("Referrer-Policy", "no-referrer");
      h.set(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'",
      );
      h.set("X-Request-Id", requestId);
      h.set("Strict-Transport-Security", "max-age=31536000");
      if (!isHook && origin && allowed.includes(origin)) {
        h.set("Access-Control-Allow-Origin", origin);
        h.set("Vary", "Origin");
        h.set("Access-Control-Allow-Credentials", "true");
        h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
        h.set(
          "Access-Control-Allow-Headers",
          "Content-Type,Authorization,X-File-Name,X-File-Category",
        );
      }
      return new Response(res.body, { status: res.status, headers: h });
    },
    async scheduled(
      _event: ScheduledController,
      e: Env,
      ctx: ExecutionContext,
    ) {
      ctx.waitUntil(cleanup(e, d));
    },
  };
}
async function route(
  req: Request,
  e: Env,
  d: Deps,
  url: URL,
): Promise<Response> {
  const path = url.pathname,
    now = d.now();
  if (path === "/health" && req.method === "GET")
    return json({
      service: "bluefin-project-portal",
      version: "0.1.0",
      mode: e.APP_ENV,
      enabled: ready(e),
    });
  if (path === "/api/v1/catalog" && req.method === "GET")
    return json({
      packages,
      materials,
      termsVersion: TERMS,
      currency: "usd",
      enabled: ready(e),
      mode: e.APP_ENV,
    });
  if (path === "/api/v1/stripe/webhook" && req.method === "POST")
    return json(await webhook(req, e, d));
  if (path.startsWith("/api/v1/admin/")) return adminRoute(req, e, d, url);
  enabled(e);
  await rate(
    e,
    "ip:" + (req.headers.get("CF-Connecting-IP") || "local"),
    120,
    now,
  );
  if (path === "/api/v1/orders" && req.method === "POST") {
    await rate(
      e,
      "create:" + (req.headers.get("CF-Connecting-IP") || "local"),
      5,
      now,
    );
    const b = object(await jsonBody(req));
    keys(b, ["cart", "customer", "turnstileToken"]);
    const q = quote(b.cart),
      customer = metadata(b.customer);
    if (q.cart.sku.startsWith("update") && !customer.dataDate)
      throw new Problem(400, "data_date_required");
    if (typeof b.turnstileToken !== "string" || b.turnstileToken.length > 2048)
      throw new Problem(400, "challenge_required");
    const challenge = await d.fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({
          secret: e.TURNSTILE_SECRET_KEY!,
          response: b.turnstileToken,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = (await challenge.json()) as any;
    if (
      !result.success ||
      result.hostname !== new URL(e.PUBLIC_SITE_ORIGIN).hostname ||
      result.action !== "create-order"
    )
      throw new Problem(403, "challenge_failed");
    const orderId = id(),
      cap = token();
    const inserted = await e.DB.prepare(
      "INSERT INTO orders(id,token_hash,sku,cart,customer,subtotal,status,created_at,expires_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM orders WHERE expires_at>?)<20",
    )
      .bind(
        orderId,
        await digest(cap),
        q.cart.sku,
        JSON.stringify(q.cart),
        JSON.stringify(customer),
        q.total,
        q.scopeReview.length ? "NEEDS_SCOPE_REVIEW" : "DRAFT",
        now,
        now + TTL,
        now,
        now,
      )
      .run();
    if (!inserted.meta.changes)
      throw new Problem(429, "workspace_capacity_reached");
    return json(
      {
        orderId,
        token: cap,
        expiresAt: now + TTL,
        status: q.scopeReview.length ? "NEEDS_SCOPE_REVIEW" : "DRAFT",
        quote: q,
      },
      201,
    );
  }
  const m = path.match(
    /^\/api\/v1\/orders\/([a-f0-9-]{36})\/(status|files|quote|checkout|reupload)(?:\/([a-f0-9-]{36}))?$/,
  );
  if (!m) throw new Problem(404, "not_found");
  const o = await owner(req, e, m[1]);
  await rate(e, "order:" + o.id, 120, now);
  if (m[2] === "status" && req.method === "GET")
    return json({
      orderId: o.id,
      sku: o.sku,
      status:
        now >= o.expires_at
          ? o.paid_at
            ? "PAID_FILES_EXPIRED"
            : "EXPIRED_UNPAID"
          : o.status,
      paid: !!o.paid_at,
      paidTotal: o.paid_total,
      paidTax: o.paid_tax,
      required: now < o.expires_at ? quote(JSON.parse(o.cart)).required : [],
      expiresAt: o.expires_at,
      serverTime: now,
      canRequestReupload: !!o.paid_at && now >= o.expires_at,
    });
  if (m[2] === "reupload" && req.method === "POST") {
    if (!o.paid_at || now < o.expires_at)
      throw new Problem(409, "reupload_not_eligible");
    await e.DB.prepare("UPDATE orders SET status='NEEDS_REUPLOAD' WHERE id=?")
      .bind(o.id)
      .run();
    return json({
      status: "NEEDS_REUPLOAD",
      message:
        "An authenticated operator must issue a new secure access code. No further payment is required.",
    });
  }
  alive(o, now);
  if (m[2] === "files" && req.method === "GET") {
    const f = await e.DB.prepare(
      "SELECT id,name,mime,category,bytes,expires_at FROM order_files WHERE order_id=? AND state='READY'",
    )
      .bind(o.id)
      .all();
    return json({ files: f.results });
  }
  if (m[2] === "files" && req.method === "POST") {
    if (o.status !== "DRAFT") throw new Problem(409, "order_locked");
    return json(await upload(req, e, o, d), 201);
  }
  if (m[2] === "files" && m[3] && req.method === "DELETE") {
    if (o.status !== "DRAFT") throw new Problem(409, "order_locked");
    const f = await e.DB.prepare(
      "SELECT * FROM order_files WHERE id=? AND order_id=? AND state='READY'",
    )
      .bind(m[3], o.id)
      .first<any>();
    if (!f) throw new Problem(404, "file_not_found");
    // Claim deletion before R2 I/O so checkout cannot count a disappearing file.
    await e.DB.prepare(
      "UPDATE order_files SET state='FAILED' WHERE id=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='DRAFT')",
    )
      .bind(f.id, o.id)
      .run();
    const current = await e.DB.prepare(
      "SELECT state FROM order_files WHERE id=?",
    )
      .bind(f.id)
      .first<any>();
    if (current?.state !== "FAILED") throw new Problem(409, "order_locked");
    await removeFile(e, f, now);
    return json({ deleted: true });
  }
  if (m[2] === "quote" && req.method === "POST") {
    if (o.status !== "DRAFT") throw new Problem(409, "order_locked");
    return json(await quoteOrder(e, d, o));
  }
  if (m[2] === "checkout" && req.method === "POST") {
    const b = object(await jsonBody(req));
    keys(b, ["consent", "termsVersion", "quoteHash"]);
    return json(await checkout(e, d, o, b));
  }
  throw new Problem(405, "method_not_allowed");
}
async function adminRoute(req: Request, e: Env, d: Deps, url: URL) {
  const actor = await admin(req, e, d);
  const agreementPath = url.pathname.match(
    /^\/api\/v1\/admin\/orders\/([a-f0-9-]{36})\/agreement$/,
  );
  if (agreementPath && req.method === "GET") {
    const evidence = await e.DB.prepare(
      "SELECT * FROM agreement_acceptances WHERE order_id=?",
    )
      .bind(agreementPath[1])
      .first();
    return json({
      acceptance: evidence || null,
      historicalEvidenceNotBackfilled: !evidence,
    });
  }
  if (
    url.pathname === "/api/v1/admin/catalog-inventory" &&
    req.method === "GET"
  ) {
    if (e.APP_ENV !== "test" || e.STRIPE_ACCOUNT_ID !== "acct_1UVrQ3BxU4PsnoX0")
      throw new Problem(403, "sandbox_required");
    const account = await stripe(e, d, "account");
    if (account.id !== e.STRIPE_ACCOUNT_ID)
      throw new Problem(503, "merchant_not_verified");
    const records: any[] = [];
    for (const kind of ["products", "prices"]) {
      let cursor = "";
      for (let page = 0; page < 20; page++) {
        const list = await stripe(
          e,
          d,
          kind +
            "?limit=100" +
            (cursor ? "&starting_after=" + encodeURIComponent(cursor) : ""),
        );
        for (const x of list.data || []) {
          if (x.livemode !== false) throw new Problem(403, "sandbox_required");
          records.push({
            kind,
            id: x.id,
            name: x.name,
            product: x.product,
            unit_amount: x.unit_amount,
            currency: x.currency,
            active: x.active,
            lookup_key: x.lookup_key,
            sku: x.metadata?.sku,
          });
        }
        if (!list.has_more) break;
        if (page === 19) throw new Problem(503, "inventory_incomplete");
        cursor = list.data.at(-1).id;
      }
    }
    return json({ account: account.id, mode: "test", records });
  }
  const now = d.now();
  if (url.pathname === "/api/v1/admin/operations" && req.method === "GET")
    return json(await operations(e, d));
  if (
    url.pathname === "/api/v1/admin/payment-reviews" &&
    req.method === "GET" &&
    e.APP_ENV === "production"
  )
    return json({
      reviews: (
        await e.DB.prepare(
          "SELECT event_id,session_id,payment_intent_id,claimed_order_id,reason,amount_total,currency,payment_status,stripe_event_created_at,recorded_at,state FROM payment_reviews WHERE state='OPEN' ORDER BY recorded_at DESC LIMIT 100",
        ).all()
      ).results,
    });
  if (url.pathname === "/api/v1/admin/orders" && req.method === "GET") {
    const before = Number(url.searchParams.get("before") || now + 1);
    if (!Number.isSafeInteger(before)) throw new Problem(400, "invalid_cursor");
    const cursorId = url.searchParams.get("cursorId") || "~";
    const list = await e.DB.prepare(
      "SELECT id,sku,subtotal,paid_total,paid_tax,currency,status,created_at,expires_at,paid_at,retrieved_at FROM orders WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 50",
    )
      .bind(before, before, cursorId)
      .all();
    return json({ orders: list.results });
  }
  const m = url.pathname.match(
    /^\/api\/v1\/admin\/orders\/([a-f0-9-]{36})(?:\/(actions|files)(?:\/([a-f0-9-]{36}))?)?$/,
  );
  if (!m) throw new Problem(404, "not_found");
  const o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(m[1])
    .first<any>();
  if (!o) throw new Problem(404, "not_found");
  if (!m[2] && req.method === "GET") {
    const f =
      now < o.expires_at
        ? await e.DB.prepare(
            "SELECT id,name,bytes,category FROM order_files WHERE order_id=? AND state='READY'",
          )
            .bind(o.id)
            .all()
        : { results: [] };
    return json({
      id: o.id,
      sku: o.sku,
      subtotal: o.subtotal,
      paidTotal: o.paid_total,
      paidTax: o.paid_tax,
      invoiceId: o.stripe_invoice_id,
      retrievedAt: o.retrieved_at,
      parentId: o.parent_id,
      customer: JSON.parse(o.customer),
      cart: JSON.parse(o.cart),
      status:
        now >= o.expires_at
          ? o.paid_at
            ? "PAID_FILES_EXPIRED"
            : "EXPIRED_UNPAID"
          : o.status,
      paid: !!o.paid_at,
      expiresAt: o.expires_at,
      files: f.results,
    });
  }
  if (m[2] === "files" && m[3] && req.method === "GET") {
    alive(o, now);
    if (!o.paid_at) throw new Problem(403, "payment_required");
    const f = await e.DB.prepare(
      "SELECT * FROM order_files WHERE id=? AND order_id=? AND state='READY' AND expires_at>?",
    )
      .bind(m[3], o.id, now)
      .first<any>();
    if (!f) throw new Problem(404, "file_not_found");
    const obj = await e.UPLOADS.get(f.r2_key);
    if (!obj) throw new Problem(404, "file_not_found");
    alive(o, d.now());
    await audit(e, o.id, actor, "download:" + f.id, now);
    return new Response(obj.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Content-Length": String(obj.size),
      },
    });
  }
  if (m[2] === "actions" && req.method === "POST") {
    const b = object(await jsonBody(req));
    keys(b, ["action"]);
    if (b.action === "mark-retrieved") {
      alive(o, now);
      if (!o.paid_at) throw new Problem(409, "payment_required");
      if (o.status !== "PAID")
        throw new Problem(409, "files_not_ready_for_retrieval");
      const outstanding = await e.DB.prepare(
        "SELECT COUNT(*) n FROM order_files f WHERE f.order_id=? AND f.state='READY' AND NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.order_id=f.order_id AND a.action='download:' || f.id)",
      )
        .bind(o.id)
        .first<{ n: number }>();
      if (outstanding?.n)
        throw new Problem(409, "download_all_files_before_confirming");
      await e.DB.prepare("UPDATE orders SET retrieved_at=? WHERE id=?")
        .bind(now, o.id)
        .run();
    } else if (b.action === "issue-reupload") {
      if (!o.paid_at || now < o.expires_at)
        throw new Problem(409, "reupload_not_eligible");
      const existing = await e.DB.prepare(
        "SELECT id FROM orders WHERE parent_id=? AND expires_at>?",
      )
        .bind(o.id, now)
        .first();
      if (existing) throw new Problem(409, "reupload_already_issued");
      const child = id(),
        cap = token();
      try {
        await e.DB.prepare(
          "INSERT INTO orders(id,token_hash,sku,cart,customer,subtotal,status,created_at,expires_at,updated_at,paid_at,parent_id,paid_total,paid_tax,stripe_invoice_id) VALUES (?,?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?)",
        )
          .bind(
            child,
            await digest(cap),
            o.sku,
            o.cart,
            o.customer,
            o.subtotal,
            now,
            now + TTL,
            now,
            o.paid_at,
            o.id,
            o.paid_total,
            o.paid_tax,
            o.stripe_invoice_id,
          )
          .run();
      } catch {
        throw new Problem(409, "reupload_already_issued");
      }
      await audit(e, o.id, actor, "issue-reupload", now);
      return json({
        orderId: child,
        token: cap,
        expiresAt: now + TTL,
        message:
          "Share this access code only through an independently verified private channel. No charge.",
      });
    } else throw new Problem(400, "invalid_action");
    await audit(e, o.id, actor, b.action, now);
    return json({ ok: true });
  }
  throw new Problem(405, "method_not_allowed");
}
export default app();
