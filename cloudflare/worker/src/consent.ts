import { Problem } from "./catalog";
import type { Env } from "./security";
// Historical orders are never backfilled. Re-upload children resolve only their original payer.
export async function requireFulfillmentConsent(e: Env, order: string) {
  const row = await e.DB.prepare(
    `SELECT a.* FROM orders o
    JOIN orders payer ON payer.id=COALESCE(o.parent_id,o.id)
    JOIN agreement_acceptances a ON a.order_id=payer.id
    WHERE o.id=? AND payer.paid_at IS NOT NULL
      AND a.stripe_session_id=payer.stripe_session_id
      AND a.quote_sha256=payer.quote_hash
      AND a.agreement_version=payer.consent_version
      AND a.portal_accepted_at=payer.consent_at
      AND a.stripe_terms_status='ACCEPTED' AND a.stripe_verified_at IS NOT NULL
      AND a.stripe_event_id IS NOT NULL`,
  )
    .bind(order)
    .first();
  if (!row) throw new Problem(403, "fulfillment_consent_required");
  return row;
}
