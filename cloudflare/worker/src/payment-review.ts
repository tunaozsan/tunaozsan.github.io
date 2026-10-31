import { stripe } from "./payments";
import { signature, bounded, type Env, type Deps } from "./security";
import { Problem } from "./catalog";

const reasons = new Set([
  "unknown_order",
  "session_not_bound",
  "payment_mismatch",
  "consent_record_missing",
  "stripe_consent_not_verified",
]);
// Record only an independently fetched, paid Live session after rechecking the
// raw webhook signature. Never store card/customer data or create consent.
export async function retainRejectedPayment(
  req: Request,
  e: Env,
  d: Deps,
  error: unknown,
) {
  if (
    e.APP_ENV !== "production" ||
    !(error instanceof Problem) ||
    !reasons.has(error.code)
  )
    return;
  const raw = new TextDecoder().decode(await bounded(req, 262144));
  await signature(
    raw,
    req.headers.get("stripe-signature") || "",
    e.STRIPE_WEBHOOK_SECRET!,
    d.now(),
  );
  const event = JSON.parse(raw),
    sid = event.data?.object?.id;
  if (
    event.livemode !== true ||
    (event.account && event.account !== e.STRIPE_ACCOUNT_ID) ||
    !/^evt_[A-Za-z0-9_]+$/.test(event.id || "") ||
    !/^cs_live_[A-Za-z0-9_]+$/.test(sid || "")
  )
    return;
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  )
    return;
  const account = await stripe(e, d, "account");
  if (account.id !== e.STRIPE_ACCOUNT_ID)
    throw new Problem(503, "merchant_not_verified");
  const s = await stripe(e, d, "checkout/sessions/" + encodeURIComponent(sid));
  if (
    s.id !== sid ||
    s.livemode !== true ||
    s.payment_status !== "paid" ||
    s.status !== "complete" ||
    !Number.isSafeInteger(s.amount_total) ||
    s.amount_total < 0 ||
    !/^[a-z]{3}$/.test(s.currency || "")
  )
    return;
  const claimed = /^[a-f0-9-]{36}$/.test(s.metadata?.order_id || "")
    ? s.metadata.order_id
    : null;
  await e.DB.prepare(
    "INSERT OR IGNORE INTO payment_reviews(event_id,session_id,payment_intent_id,claimed_order_id,reason,amount_total,currency,payment_status,stripe_event_created_at,recorded_at) VALUES (?,?,?,?,?,?,?,'paid',?,?)",
  )
    .bind(
      event.id,
      sid,
      /^pi_[A-Za-z0-9]+$/.test(s.payment_intent || "")
        ? s.payment_intent
        : null,
      claimed,
      error.code,
      s.amount_total,
      s.currency,
      Number.isSafeInteger(event.created) ? event.created : null,
      d.now(),
    )
    .run();
}
