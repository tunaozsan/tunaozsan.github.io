import { refundEvent } from "./refunds";
import { sandboxPrices } from "./stripe-catalog";
import { livePrices, LIVE_ACCOUNT_ID } from "./live-catalog";
import { retainRejectedPayment } from "./payment-review";
import { AGREEMENT_HASH, AGREEMENT_STATUS } from "./agreement";
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
      Authorization: `Bearer ${e.STRIPE_SECRET_KEY?.trim()}`,
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
  if (e.APP_ENV === "production" && AGREEMENT_STATUS !== "APPROVED")
    throw new Problem(503, "agreement_not_approved");
  if (o.paid_at) throw new Problem(409, "already_paid");
  if (o.expires_at - d.now() < 1860)
    throw new Problem(409, "too_late_for_checkout");
  if (body.consent !== true || body.termsVersion !== TERMS)
    throw new Problem(400, "consent_required");
  if (o.stripe_session_id && o.checkout_url) {
    const evidence = await e.DB.prepare(
      "SELECT * FROM agreement_acceptances WHERE order_id=?",
    )
      .bind(o.id)
      .first<any>();
    if (
      !evidence ||
      evidence.agreement_version !== TERMS ||
      evidence.agreement_sha256 !== AGREEMENT_HASH ||
      evidence.stripe_session_id !== o.stripe_session_id ||
      evidence.quote_sha256 !== body.quoteHash
    )
      throw new Problem(409, "agreement_changed_review_again");
    const existing = await stripe(
      e,
      d,
      "checkout/sessions/" + encodeURIComponent(o.stripe_session_id),
    );
    if (
      existing.status !== "open" ||
      existing.payment_status !== "unpaid" ||
      existing.consent_collection?.terms_of_service !== "required"
    )
      throw new Problem(409, "checkout_no_longer_open");
    return { url: o.checkout_url };
  }
  if (
    !o.quote_hash ||
    body.quoteHash !== o.quote_hash ||
    o.quote_until <= d.now()
  )
    throw new Problem(409, "quote_expired");
  const q = quote(JSON.parse(o.cart));
  const currentHash = await digest(
    JSON.stringify({
      cart: q.cart,
      total: q.total,
      terms: TERMS,
      agreementHash: AGREEMENT_HASH,
    }),
  );
  if (q.total !== o.subtotal || currentHash !== o.quote_hash)
    throw new Problem(409, "quote_changed_review_again");
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
  const acceptedOrder = await e.DB.prepare(
    "SELECT consent_at,consent_version FROM orders WHERE id=?",
  )
    .bind(o.id)
    .first<any>();
  if (acceptedOrder?.consent_version !== TERMS || !acceptedOrder.consent_at)
    throw new Problem(409, "consent_record_missing");
  await e.DB.prepare(
    "INSERT OR IGNORE INTO agreement_acceptances(order_id,agreement_version,agreement_sha256,agreement_status,documents_url,scope_json,quote_sha256,portal_accepted_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      o.id,
      TERMS,
      AGREEMENT_HASH,
      AGREEMENT_STATUS,
      e.PUBLIC_SITE_ORIGIN + "/assets/legal/" + TERMS + ".json",
      JSON.stringify({
        cart: q.cart,
        lines: q.lines,
        total: q.total,
        currency: "usd",
        required: q.required,
      }),
      o.quote_hash,
      acceptedOrder.consent_at,
    )
    .run();
  const acceptance = await e.DB.prepare(
    "SELECT agreement_sha256,quote_sha256 FROM agreement_acceptances WHERE order_id=?",
  )
    .bind(o.id)
    .first<any>();
  if (
    acceptance?.agreement_sha256 !== AGREEMENT_HASH ||
    acceptance.quote_sha256 !== o.quote_hash
  )
    throw new Problem(409, "agreement_changed_review_again");
  const b = new URLSearchParams({
    mode: "payment",
    client_reference_id: o.id,
    "metadata[order_id]": o.id,
    "metadata[quote_hash]": o.quote_hash,
    "metadata[agreement_version]": TERMS,
    "metadata[agreement_sha256]": AGREEMENT_HASH,
    "metadata[agreement_status]": AGREEMENT_STATUS,
    "custom_text[terms_of_service_acceptance][message]":
      "I agree to the [Service Terms](" +
      e.PUBLIC_SITE_ORIGIN +
      "/service-terms.html) and [Cancellation & Refund Policy](" +
      e.PUBLIC_SITE_ORIGIN +
      "/refund-policy.html). Agreement version " +
      TERMS +
      ".",

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
  if (e.INVOICE_CREATION === "true") {
    b.set("customer_creation", "always");
    b.set("invoice_creation[invoice_data][metadata][order_id]", o.id);
    b.set(
      "invoice_creation[invoice_data][description]",
      "Bluefin Tuna LLC · " + q.lines[0].name,
    );
  }
  for (const [i, l] of q.lines.entries()) {
    // Persisted Catalog prices only; never invent Stripe IDs or silently create products.
    const mapped =
      e.APP_ENV === "test" && e.STRIPE_ACCOUNT_ID === "acct_1UVrQ3BxU4PsnoX0"
        ? sandboxPrices[l.sku]
        : e.APP_ENV === "production" && e.STRIPE_ACCOUNT_ID === LIVE_ACCOUNT_ID
          ? livePrices[l.sku]
          : undefined;
    const result = mapped
      ? {
          data: [
            await stripe(e, d, "prices/" + mapped.price + "?expand[]=product"),
          ],
          has_more: false,
        }
      : await stripe(
          e,
          d,
          "prices?" +
            new URLSearchParams({
              "lookup_keys[]": l.sku,
              active: "true",
              "expand[]": "data.product",
              limit: "2",
            }),
        );
    const p = result.data?.[0];
    if (
      result.has_more ||
      result.data?.length !== 1 ||
      !p?.active ||
      (mapped
        ? p.id !== mapped.price || p.product?.id !== mapped.product
        : p.lookup_key !== l.sku) ||
      p.unit_amount !== l.unit ||
      p.currency !== "usd" ||
      p.type !== "one_time" ||
      p.livemode !== (e.APP_ENV === "production") ||
      !p.product?.active ||
      p.product?.deleted ||
      p.product?.livemode !== p.livemode
    )
      throw new Problem(503, "catalog_price_missing_or_mismatched");
    b.set(`line_items[${i}][price]`, p.id);
    b.set(`line_items[${i}][quantity]`, String(l.quantity));
  }
  const session = await stripe(
    e,
    d,
    "checkout/sessions",
    b,
    `checkout-${o.id}-${o.quote_hash}`,
  );
  if (
    session.consent_collection?.terms_of_service !== "required" ||
    session.livemode !== (e.APP_ENV === "production") ||
    session.client_reference_id !== o.id ||
    session.amount_subtotal !== q.total ||
    session.currency !== "usd" ||
    session.expires_at > o.expires_at ||
    !/^https:\/\/checkout\.stripe\.com\//.test(session.url || "")
  )
    throw new Problem(502, "invalid_checkout_response");
  await e.DB.batch([
    e.DB.prepare(
      "UPDATE orders SET stripe_session_id=?,checkout_url=? WHERE id=? AND stripe_session_id IS NULL",
    ).bind(session.id, session.url, o.id),
    e.DB.prepare(
      "UPDATE agreement_acceptances SET stripe_session_id=? WHERE order_id=? AND stripe_session_id IS NULL",
    ).bind(session.id, o.id),
  ]);
  return { url: session.url };
}
export async function webhook(req: Request, e: Env, d: Deps) {
  if (e.APP_ENV !== "production") return verifiedWebhook(req, e, d);
  const evidence = req.clone();
  try {
    return await verifiedWebhook(req, e, d);
  } catch (error) {
    await retainRejectedPayment(evidence, e, d, error);
    // Preserve the retry for Checkout-persistence races. The review queue is
    // idempotent and does not claim that an unbound payment is a paid order.
    throw error;
  }
}
async function verifiedWebhook(req: Request, e: Env, d: Deps) {
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
  if (e.APP_ENV === "test" && event.type === "charge.refunded")
    return refundEvent(e, d, event);
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
    s.metadata?.order_id !== o.id ||
    !Number.isSafeInteger(s.amount_total) ||
    !Number.isSafeInteger(s.total_details?.amount_tax ?? 0) ||
    (s.total_details?.amount_tax ?? 0) < 0 ||
    s.currency !== "usd" ||
    s.amount_subtotal !== o.subtotal ||
    s.amount_total !== s.amount_subtotal + (s.total_details?.amount_tax ?? 0) ||
    s.total_details?.amount_discount ||
    s.total_details?.amount_shipping
  )
    throw new Problem(400, "payment_mismatch");
  const paid = s.payment_status === "paid" && s.status === "complete";
  const acceptance = await e.DB.prepare(
    "SELECT * FROM agreement_acceptances WHERE order_id=?",
  )
    .bind(o.id)
    .first<any>();
  if (!acceptance) throw new Problem(409, "consent_record_missing");
  if (
    acceptance &&
    (acceptance.stripe_session_id !== s.id ||
      acceptance.agreement_version !== s.metadata?.agreement_version ||
      acceptance.agreement_sha256 !== s.metadata?.agreement_sha256 ||
      acceptance.quote_sha256 !== s.metadata?.quote_hash ||
      s.consent_collection?.terms_of_service !== "required" ||
      (paid && s.consent?.terms_of_service !== "accepted"))
  )
    throw new Problem(409, "stripe_consent_not_verified");
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
    ...(acceptance && paid
      ? [
          e.DB.prepare(
            "UPDATE agreement_acceptances SET stripe_terms_status='ACCEPTED',stripe_verified_at=?,stripe_event_id=?,stripe_event_created_at=? WHERE order_id=? AND stripe_terms_status='PENDING'",
          ).bind(
            d.now(),
            event.id,
            Number.isSafeInteger(event.created) ? event.created : null,
            o.id,
          ),
        ]
      : []),
    e.DB.prepare(
      "INSERT OR IGNORE INTO payment_events(id,event_type,order_id,created_at,status) VALUES (?,?,?,?,'PROCESSED')",
    ).bind(event.id, event.type, o.id, d.now()),
    e.DB.prepare(
      "UPDATE orders SET status=?,paid_at=CASE WHEN ?=1 THEN COALESCE(paid_at,?) ELSE paid_at END,paid_total=CASE WHEN ?=1 THEN ? ELSE paid_total END,paid_tax=CASE WHEN ?=1 THEN ? ELSE paid_tax END,stripe_invoice_id=COALESCE(?,stripe_invoice_id),updated_at=? WHERE id=? AND (paid_at IS NULL OR ?=1)",
    ).bind(
      state,
      paid ? 1 : 0,
      d.now(),
      paid ? 1 : 0,
      s.amount_total,
      paid ? 1 : 0,
      s.total_details?.amount_tax ?? 0,
      paid && typeof s.invoice === "string" ? s.invoice : null,
      d.now(),
      o.id,
      paid ? 1 : 0,
    ),
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
    JSON.stringify({
      cart: q.cart,
      total: q.total,
      terms: TERMS,
      agreementHash: AGREEMENT_HASH,
    }),
  );
  await e.DB.prepare(
    "UPDATE orders SET subtotal=?,quote_hash=?,quote_until=?,status=CASE WHEN paid_at IS NOT NULL AND ?=0 THEN 'PAID' ELSE status END WHERE id=? AND status='DRAFT'",
  )
    .bind(
      q.total,
      hash,
      Math.min(o.expires_at, d.now() + 900),
      missing.length,
      o.id,
    )
    .run();
  return {
    ...q,
    missing,
    quoteHash: hash,
    quoteUntil: Math.min(o.expires_at, d.now() + 900),
    termsVersion: TERMS,
    agreementHash: AGREEMENT_HASH,
    agreementStatus: AGREEMENT_STATUS,
  };
}
