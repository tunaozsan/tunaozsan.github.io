import { Problem } from "./catalog";
import { stripe } from "./payments";
import { type Env, type Deps } from "./security";

async function merchant(e: Env, d: Deps) {
  if ((await stripe(e, d, "account")).id !== e.STRIPE_ACCOUNT_ID)
    throw new Problem(503, "merchant_not_verified");
}
export async function applyRefund(
  e: Env,
  d: Deps,
  payer: string,
  charge: any,
  event?: string,
) {
  if (
    charge.livemode !== (e.APP_ENV === "production") ||
    typeof charge.id !== "string" ||
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded <= 0 ||
    charge.currency !== "usd"
  )
    throw new Problem(409, "refund_mismatch");
  const affected = "SELECT id FROM orders WHERE id=? OR parent_id=?";
  await e.DB.batch([
    e.DB.prepare(
      `INSERT INTO payment_refund_holds(order_id,charge_id,amount_refunded,currency,first_seen_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET amount_refunded=MAX(amount_refunded,excluded.amount_refunded),updated_at=excluded.updated_at`,
    ).bind(
      payer,
      charge.id,
      charge.amount_refunded,
      charge.currency,
      d.now(),
      d.now(),
    ),
    ...(event
      ? [
          e.DB.prepare(
            "INSERT OR IGNORE INTO payment_refund_events(event_id,order_id,charge_id,amount_refunded,observed_at) VALUES (?,?,?,?,?)",
          ).bind(event, payer, charge.id, charge.amount_refunded, d.now()),
        ]
      : []),
    e.DB.prepare(
      `UPDATE deliveries SET status='REVOKED',version=version+1 WHERE order_id IN (${affected}) AND status!='REVOKED'`,
    ).bind(payer, payer),
    e.DB.prepare(
      `DELETE FROM delivery_invites WHERE order_id IN (${affected})`,
    ).bind(payer, payer),
    e.DB.prepare(
      `DELETE FROM delivery_sessions WHERE order_id IN (${affected})`,
    ).bind(payer, payer),
  ]);
}
async function payerFor(e: Env, order: string) {
  return e.DB.prepare(
    "SELECT p.* FROM orders o JOIN orders p ON p.id=COALESCE(o.parent_id,o.id) WHERE o.id=?",
  )
    .bind(order)
    .first<any>();
}
export async function checkRefund(e: Env, d: Deps, order: string) {
  const p = await payerFor(e, order);
  if (!p?.stripe_session_id || !p.paid_at)
    throw new Problem(403, "verified_payment_required");
  const held = await e.DB.prepare(
    "SELECT * FROM payment_refund_holds WHERE order_id=?",
  )
    .bind(p.id)
    .first<any>();
  if (held) {
    await applyRefund(e, d, p.id, {
      id: held.charge_id,
      amount_refunded: held.amount_refunded,
      currency: held.currency,
      livemode: e.APP_ENV === "production",
    });
    throw new Problem(403, "payment_refunded");
  }
  await merchant(e, d);
  const s = await stripe(
    e,
    d,
    "checkout/sessions/" + encodeURIComponent(p.stripe_session_id),
  );
  if (
    s.id !== p.stripe_session_id ||
    s.livemode !== (e.APP_ENV === "production") ||
    s.metadata?.order_id !== p.id ||
    typeof s.payment_intent !== "string" ||
    s.payment_status !== "paid" ||
    s.amount_total !== p.paid_total ||
    s.currency !== "usd"
  )
    throw new Problem(503, "payment_verification_unavailable");
  const pi = await stripe(
    e,
    d,
    "payment_intents/" + encodeURIComponent(s.payment_intent),
  );
  if (typeof pi.latest_charge !== "string")
    throw new Problem(503, "payment_verification_unavailable");
  const charge = await stripe(
    e,
    d,
    "charges/" + encodeURIComponent(pi.latest_charge),
  );
  if (
    charge.livemode !== (e.APP_ENV === "production") ||
    charge.payment_intent !== s.payment_intent ||
    charge.id !== pi.latest_charge ||
    charge.currency !== "usd"
  )
    throw new Problem(503, "payment_verification_unavailable");
  if (charge.amount_refunded > 0) {
    await applyRefund(e, d, p.id, charge);
    throw new Problem(403, "payment_refunded");
  }
  if (
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded < 0 ||
    charge.refunded
  )
    throw new Problem(503, "payment_verification_unavailable");
  await e.DB.prepare(
    "INSERT INTO payment_refund_checks(order_id,checked_at) VALUES (?,?) ON CONFLICT(order_id) DO UPDATE SET checked_at=excluded.checked_at",
  )
    .bind(p.id, d.now())
    .run();
}
// Called only AFTER the normal webhook signature, environment and account validation.
export async function refundEvent(e: Env, d: Deps, event: any) {
  const id = event.data?.object?.id;
  if (typeof id !== "string" || !id.startsWith("ch_"))
    throw new Problem(400, "invalid_charge");
  await merchant(e, d);
  const c = await stripe(e, d, "charges/" + encodeURIComponent(id));
  if (
    c.id !== id ||
    c.livemode !== (e.APP_ENV === "production") ||
    typeof c.payment_intent !== "string"
  )
    throw new Problem(400, "refund_mismatch");
  if (!(c.amount_refunded > 0)) return { received: true, refund: false };
  const sessions = await stripe(
    e,
    d,
    "checkout/sessions?" +
      new URLSearchParams({ payment_intent: c.payment_intent, limit: "100" }),
  );
  if (sessions.has_more) throw new Problem(503, "refund_mapping_incomplete");
  let mapped = 0;
  for (const s of sessions.data || []) {
    const o: any = await e.DB.prepare(
      "SELECT * FROM orders WHERE stripe_session_id=?",
    )
      .bind(s.id)
      .first();
    if (!o) continue; // Direct Payment Link payments cannot create portal orders/consent.
    if (
      s.livemode !== (e.APP_ENV === "production") ||
      s.payment_intent !== c.payment_intent ||
      s.metadata?.order_id !== o.id ||
      s.metadata?.quote_hash !== o.quote_hash ||
      s.currency !== "usd" ||
      s.amount_subtotal !== o.subtotal
    )
      throw new Problem(409, "refund_mapping_mismatch");
    await applyRefund(e, d, o.id, c, event.id);
    mapped++;
  }
  return { received: true, refundOrders: mapped };
}
export async function reconcileRefunds(e: Env, d: Deps) {
  const due = await e.DB.prepare(
    `SELECT DISTINCT COALESCE(o.parent_id,o.id) AS id FROM deliveries v JOIN orders o ON o.id=v.order_id LEFT JOIN payment_refund_checks c ON c.order_id=COALESCE(o.parent_id,o.id) WHERE v.status='PUBLISHED' ORDER BY COALESCE(c.checked_at,0) LIMIT 10`,
  ).all<any>();
  for (const o of due.results) {
    try {
      await checkRefund(e, d, o.id);
    } catch (err) {
      await e.DB.prepare(
        "INSERT INTO audit_events(order_id,actor,action,created_at) VALUES (?,?,?,?)",
      )
        .bind(
          o.id,
          "system",
          "refund_reconcile:" +
            (err instanceof Problem ? err.code : "provider_unavailable"),
          d.now(),
        )
        .run();
      await e.DB.prepare(
        "INSERT INTO payment_refund_checks(order_id,checked_at) VALUES (?,?) ON CONFLICT(order_id) DO UPDATE SET checked_at=excluded.checked_at",
      )
        .bind(o.id, d.now())
        .run();
    }
  }
}
