import { Problem, quote, TERMS } from "./catalog";
import { type Env, type Deps, digest, signature, bounded } from "./security";
export async function stripe(
  e: Env,
  d: Deps,
  path: string,
  body?: URLSearchParams,
  key?: string,
) {
  const r = await d.fetch("https://api.stripe.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${e.STRIPE_SECRET_KEY}`,
      "Stripe-Version": "2025-02-24.acacia",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Problem(502, "payment_provider_unavailable");
  return (await r.json()) as any;
}
export async function checkout(e: Env, d: Deps, o: any, body: any) {
  if (o.paid_at) throw new Problem(409, "already_paid");
  if (o.expires_at - d.now() < 1860)
    throw new Problem(409, "too_late_for_checkout");
  if (o.stripe_session_id && o.checkout_url) return { url: o.checkout_url };
  if (body.consent !== true || body.termsVersion !== TERMS)
    throw new Problem(400, "consent_required");
  if (
    !o.quote_hash ||
    body.quoteHash !== o.quote_hash ||
    o.quote_until <= d.now()
  )
    throw new Problem(409, "quote_expired");
  const q = quote(JSON.parse(o.cart));
  if (q.scopeReview.length) throw new Problem(409, "scope_review_required");
  const files = await e.DB.prepare(
    "SELECT category FROM order_files WHERE order_id=? AND state='READY' AND expires_at>?",
  )
    .bind(o.id, d.now())
    .all<{ category: string }>();
  if (q.required.some((x) => !files.results.some((f) => f.category === x)))
    throw new Problem(409, "required_documents_missing");
  const pending = await e.DB.prepare(
    "SELECT id FROM order_files WHERE order_id=? AND state='UPLOADING'",
  )
    .bind(o.id)
    .first();
  if (pending) throw new Problem(409, "upload_in_progress");
  const account = await stripe(e, d, "account");
  if (account.id !== e.STRIPE_ACCOUNT_ID)
    throw new Problem(503, "merchant_not_verified");
  const requiredSQL = q.required
    .map(
      () =>
        "EXISTS(SELECT 1 FROM order_files WHERE order_id=orders.id AND state='READY' AND category=? AND expires_at>?)",
    )
    .join(" AND ");
  const frozen = await e.DB.prepare(
    "UPDATE orders SET status='AWAITING_PAYMENT',consent_version=?,consent_at=?,updated_at=? WHERE id=? AND status='DRAFT' AND expires_at>? AND quote_hash=? AND NOT EXISTS(SELECT 1 FROM order_files WHERE order_id=orders.id AND state='UPLOADING') AND " +
      requiredSQL,
  )
    .bind(
      TERMS,
      d.now(),
      d.now(),
      o.id,
      d.now(),
      o.quote_hash,
      ...q.required.flatMap((x) => [x, d.now()]),
    )
    .run();
  if (!frozen.meta.changes && o.status === "DRAFT")
    throw new Problem(409, "order_changed_retry");
  const locked = await e.DB.prepare(
    "SELECT status,quote_hash FROM orders WHERE id=?",
  )
    .bind(o.id)
    .first<any>();
  if (
    locked?.status !== "AWAITING_PAYMENT" ||
    locked.quote_hash !== o.quote_hash
  )
    throw new Problem(409, "order_locked");
  const b = new URLSearchParams({
    mode: "payment",
    client_reference_id: o.id,
    "metadata[order_id]": o.id,
    "metadata[quote_hash]": o.quote_hash,
    "payment_method_types[0]": "card",
    success_url: e.PUBLIC_SITE_ORIGIN + "/payment/success/",
    cancel_url: e.PUBLIC_SITE_ORIGIN + "/payment/cancel/",
    expires_at: String(o.expires_at),
    customer_email: JSON.parse(o.customer).email,
    billing_address_collection: "required",
    "automatic_tax[enabled]": String(e.TAX_MODE === "automatic"),
    "invoice_creation[enabled]": String(e.INVOICE_CREATION === "true"),
    "consent_collection[terms_of_service]": "required",
  });
  q.lines.forEach((l, i) => {
    b.set(`line_items[${i}][price_data][currency]`, "usd");
    b.set(`line_items[${i}][price_data][unit_amount]`, String(l.unit));
    b.set(`line_items[${i}][price_data][product_data][name]`, l.name);
    b.set(`line_items[${i}][quantity]`, String(l.quantity));
  });
  const session = await stripe(
    e,
    d,
    "checkout/sessions",
    b,
    `checkout-${o.id}-${o.quote_hash}`,
  );
  if (
    session.livemode !== (e.APP_ENV === "production") ||
    session.client_reference_id !== o.id ||
    session.amount_subtotal !== q.total ||
    session.currency !== "usd" ||
    session.expires_at > o.expires_at ||
    !/^https:\/\/checkout\.stripe\.com\//.test(session.url || "")
  )
    throw new Problem(502, "invalid_checkout_response");
  await e.DB.prepare(
    "UPDATE orders SET stripe_session_id=?,checkout_url=? WHERE id=? AND stripe_session_id IS NULL",
  )
    .bind(session.id, session.url, o.id)
    .run();
  return { url: session.url };
}
export async function webhook(req: Request, e: Env, d: Deps) {
  if (!e.STRIPE_WEBHOOK_SECRET || !e.STRIPE_SECRET_KEY)
    throw new Problem(503, "webhook_not_configured");
  const raw = new TextDecoder().decode(await bounded(req, 262144));
  await signature(
    raw,
    req.headers.get("stripe-signature") || "",
    e.STRIPE_WEBHOOK_SECRET,
    d.now(),
  );
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new Problem(400, "invalid_event");
  }
  if (
    event.livemode !== (e.APP_ENV === "production") ||
    !["test", "production"].includes(e.APP_ENV) ||
    typeof event.id !== "string"
  )
    throw new Problem(400, "wrong_environment");
  if (event.account && event.account !== e.STRIPE_ACCOUNT_ID)
    throw new Problem(400, "wrong_account");
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ].includes(event.type)
  )
    return { received: true };
  const x = event.data?.object;
  if (!x?.metadata?.order_id) throw new Problem(400, "unknown_order");
  const o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(x.metadata.order_id)
    .first<any>();
  if (!o || o.stripe_session_id !== x.id)
    throw new Problem(409, "session_not_bound"); // Stripe retries if webhook races checkout persistence.
  const seen = await e.DB.prepare("SELECT id FROM payment_events WHERE id=?")
    .bind(event.id)
    .first();
  if (seen) return { received: true, duplicate: true };
  const s = await stripe(e, d, "checkout/sessions/" + encodeURIComponent(x.id));
  if (
    s.id !== o.stripe_session_id ||
    s.livemode !== (e.APP_ENV === "production") ||
    s.client_reference_id !== o.id ||
    s.metadata?.quote_hash !== o.quote_hash ||
    s.currency !== "usd" ||
    s.amount_subtotal !== o.subtotal ||
    s.amount_total !== s.amount_subtotal + (s.total_details?.amount_tax ?? 0) ||
    s.total_details?.amount_discount ||
    s.total_details?.amount_shipping
  )
    throw new Problem(400, "payment_mismatch");
  const paid = s.payment_status === "paid" && s.status === "complete";
  if (!paid && event.type === "checkout.session.async_payment_succeeded")
    throw new Problem(400, "payment_not_paid");
  const state = paid
    ? d.now() >= o.expires_at
      ? "PAID_FILES_EXPIRED"
      : "PAID"
    : s.status === "expired"
      ? "EXPIRED_UNPAID"
      : event.type === "checkout.session.async_payment_failed"
        ? "CANCELLED"
        : "PAYMENT_PROCESSING";
  await e.DB.batch([
    e.DB.prepare(
      "INSERT OR IGNORE INTO payment_events(id,event_type,order_id,created_at,status) VALUES (?,?,?,?,'PROCESSED')",
    ).bind(event.id, event.type, o.id, d.now()),
    e.DB.prepare(
      "UPDATE orders SET status=?,paid_at=CASE WHEN ?=1 THEN COALESCE(paid_at,?) ELSE paid_at END,updated_at=? WHERE id=? AND (paid_at IS NULL OR ?=1)",
    ).bind(state, paid ? 1 : 0, d.now(), d.now(), o.id, paid ? 1 : 0),
    e.DB.prepare(
      "INSERT OR IGNORE INTO notifications(order_id,next_at) SELECT id,? FROM orders WHERE id=? AND paid_at IS NOT NULL",
    ).bind(d.now(), o.id),
  ]);
  return { received: true };
}
export async function quoteOrder(e: Env, d: Deps, o: any) {
  const q = quote(JSON.parse(o.cart));
  const files = await e.DB.prepare(
    "SELECT category FROM order_files WHERE order_id=? AND state='READY' AND expires_at>?",
  )
    .bind(o.id, d.now())
    .all<{ category: string }>();
  const missing = q.required.filter(
    (x) => !files.results.some((f) => f.category === x),
  );
  const hash = await digest(
    JSON.stringify({ cart: q.cart, total: q.total, terms: TERMS }),
  );
  await e.DB.prepare(
    "UPDATE orders SET quote_hash=?,quote_until=?,status=CASE WHEN paid_at IS NOT NULL AND ?=0 THEN 'PAID' ELSE status END WHERE id=? AND status='DRAFT'",
  )
    .bind(hash, Math.min(o.expires_at, d.now() + 900), missing.length, o.id)
    .run();
  return {
    ...q,
    missing,
    quoteHash: hash,
    quoteUntil: Math.min(o.expires_at, d.now() + 900),
    termsVersion: TERMS,
  };
}
