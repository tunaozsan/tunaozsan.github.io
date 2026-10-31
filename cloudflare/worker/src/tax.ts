import { Problem } from "./catalog";
import type { Env, Deps } from "./security";

// Owner-selected classification; exact identifier verified against Stripe's Tax Codes list.
export const CONSULTING_TAX_CODE = "txcd_20060048";
export const STRIPE_REST_VERSION = "2025-02-24.acacia";

export function checkTaxPrice(price: any, defaults?: any) {
  const code = price.product?.tax_code ?? defaults?.tax_code;
  const behavior =
    price.tax_behavior === "unspecified"
      ? defaults?.tax_behavior
      : price.tax_behavior;
  // Stripe account defaults are authoritative when the Product/Price has no override.
  const exclusive =
    behavior === "exclusive" ||
    (behavior === "inferred_by_currency" && price.currency === "usd");
  if (
    !exclusive ||
    (typeof code === "string" ? code : code?.id) !== CONSULTING_TAX_CODE
  )
    throw new Problem(503, "catalog_tax_configuration_required");
}

export function checkAutomaticSession(session: any) {
  if (
    session.automatic_tax?.enabled !== true ||
    session.billing_address_collection !== "required" ||
    session.tax_id_collection?.enabled !== true ||
    session.tax_id_collection?.required !== "never" ||
    session.automatic_tax?.status === "failed"
  )
    throw new Problem(502, "tax_calculation_unavailable");
}

// Only a fresh server-side Stripe response is accepted here. A zero amount does
// not imply exemption: keep Stripe's actual reason (including not_collecting).
export function taxEvidence(session: any) {
  checkAutomaticSession(session);
  const tax = session.total_details?.amount_tax;
  const breakdown = session.total_details?.breakdown?.taxes;
  const address = session.customer_details?.address;
  if (
    session.automatic_tax.status !== "complete" ||
    !Number.isSafeInteger(tax) ||
    tax < 0 ||
    !Number.isSafeInteger(session.amount_subtotal) ||
    session.amount_subtotal < 0 ||
    session.amount_total !== session.amount_subtotal + tax ||
    !address?.country ||
    !address?.line1 ||
    (address.country === "US" && (!address.state || !address.postal_code)) ||
    !Array.isArray(breakdown) ||
    !breakdown.length ||
    breakdown.some(
      (t: any) =>
        !Number.isSafeInteger(t.amount) ||
        t.amount < 0 ||
        typeof t.taxability_reason !== "string" ||
        !t.taxability_reason ||
        !t.rate ||
        t.rate.inclusive !== false ||
        t.rate.livemode !== session.livemode,
    ) ||
    breakdown.reduce((sum: number, t: any) => sum + t.amount, 0) !== tax
  )
    throw new Problem(409, "tax_result_not_verified");
  return breakdown.map((t: any) => ({
    amount: t.amount,
    taxability_reason: t.taxability_reason,
    taxable_amount: t.taxable_amount ?? null,
    rate_id: t.rate.id,
    country: t.rate.country,
    state: t.rate.state,
    percentage: t.rate.percentage,
    tax_type: t.rate.tax_type,
  }));
}

export function taxStatement(e: Env, d: Deps, s: any, order: any, event: any) {
  const breakdown = taxEvidence(s);
  return e.DB.prepare(
    `INSERT OR IGNORE INTO payment_tax_evidence
    (order_id,stripe_session_id,stripe_event_id,stripe_account_id,rest_version,verified_at,
     currency,subtotal,tax,total,tax_status,tax_code,tax_behavior,billing_country,billing_state,breakdown_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,'complete',?,'exclusive',?,?,?)`,
  ).bind(
    order.id,
    s.id,
    event.id,
    e.STRIPE_ACCOUNT_ID,
    STRIPE_REST_VERSION,
    d.now(),
    s.currency,
    s.amount_subtotal,
    s.total_details.amount_tax,
    s.amount_total,
    CONSULTING_TAX_CODE,
    s.customer_details.address.country,
    s.customer_details.address.state ?? null,
    JSON.stringify(breakdown),
  );
}
