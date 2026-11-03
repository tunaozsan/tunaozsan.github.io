import { Problem } from "./catalog";
import { LEGACY_LINKS } from "./legacy-links";
import { LIVE_ACCOUNT_ID } from "./live-catalog";
import { stripe } from "./payments";
import { type Env, type Deps } from "./security";

// Only called after raw-body signature, mode and account checks. Retiring a
// Payment Link emits legitimate expired events without portal order metadata.
// Acknowledge only a known, independently verified non-financial lifecycle event.
export async function legacyExpiredEvent(e: Env, d: Deps, event: any) {
  const x = event.data?.object;
  if (
    e.APP_ENV !== "production" ||
    e.STRIPE_ACCOUNT_ID !== LIVE_ACCOUNT_ID ||
    event.type !== "checkout.session.expired" ||
    !/^evt_[A-Za-z0-9]+$/.test(event.id || "") ||
    !/^cs_live_[A-Za-z0-9]+$/.test(x?.id || "") ||
    !LEGACY_LINKS.includes(x?.payment_link) ||
    x?.metadata?.order_id ||
    x?.client_reference_id ||
    x?.status !== "expired" ||
    x?.payment_status !== "unpaid" ||
    x?.payment_intent !== null
  )
    throw new Problem(400, "unknown_order");

  if ((await stripe(e, d, "account")).id !== LIVE_ACCOUNT_ID)
    throw new Problem(503, "merchant_not_verified");
  const s = await stripe(e, d, "checkout/sessions/" + encodeURIComponent(x.id));
  if (
    s.id !== x.id ||
    s.livemode !== true ||
    s.mode !== "payment" ||
    s.payment_link !== x.payment_link ||
    !LEGACY_LINKS.includes(s.payment_link) ||
    s.status !== "expired" ||
    s.payment_status !== "unpaid" ||
    s.payment_intent !== null ||
    s.metadata?.order_id ||
    s.client_reference_id
  )
    throw new Problem(409, "legacy_expiry_not_verified");

  const bound = await e.DB.prepare(
    "SELECT id FROM orders WHERE stripe_session_id=?",
  )
    .bind(s.id)
    .first();
  if (bound) throw new Problem(409, "session_not_bound");
  const action = "stripe_legacy_expired:" + event.id;
  // One atomic statement makes concurrent retries idempotent using the existing
  // audit table. No fake order, consent, paid row, file job or schema change.
  const saved = await e.DB.prepare(
    "INSERT INTO audit_events(order_id,actor,action,created_at) SELECT NULL,'stripe',?,? WHERE NOT EXISTS (SELECT 1 FROM audit_events WHERE actor='stripe' AND action=?)",
  )
    .bind(action, d.now(), action)
    .run();
  return {
    received: true,
    classification: "legacy_expired_unpaid",
    duplicate: saved.meta.changes === 0,
  };
}
