import { ready, type Env } from "./security";

// Explicit owner decision on 2026-11-02: no per-order Admin tax preapproval;
// charge using the existing Stripe Tax configuration, preserving its actual reason.
// This policy is not an exemption or a professional tax opinion.
export const DIRECT_CHECKOUT_POLICY = "owner-stripe-tax-direct-2026-11-02";
export function directIntakeReady(e: Env) {
  return (
    e.DIRECT_CHECKOUT_ENABLED === "true" &&
    e.DIRECT_CHECKOUT_POLICY === DIRECT_CHECKOUT_POLICY &&
    e.TAX_MODE === "automatic" &&
    e.REVIEWED_INVOICE_MODE === "portal_pdf" &&
    ready({ ...e, PORTAL_ENABLED: "true" })
  );
}
export function isDirectOrder(o: any) {
  try {
    return JSON.parse(o.customer).checkoutPolicy === DIRECT_CHECKOUT_POLICY;
  } catch {
    return false;
  }
}
