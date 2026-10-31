import { Problem, quote, TTL, object, keys } from "./catalog";
import { AGREEMENT_HASH, AGREEMENT_VERSION } from "./agreement";
import {
  admin,
  digest,
  id,
  token,
  jsonBody,
  rate,
  ready,
  type Env,
  type Deps,
} from "./security";
import { verifyWorkingRoot, type DriveEnv } from "./drive";
import { stripe } from "./payments";
import { taxEvidence } from "./tax";
export type ApprovalEnv = DriveEnv & { APPROVED_ORDERS_ENABLED?: string };
export function approvedIntakeReady(e: ApprovalEnv) {
  return (
    e.APPROVED_ORDERS_ENABLED === "true" &&
    e.TAX_MODE === "automatic" &&
    e.INVOICE_CREATION === "true" &&
    e.REVIEWED_INVOICE_MODE === "portal_pdf" &&
    ready({ ...e, PORTAL_ENABLED: "true" })
  );
}
export async function orderQuoteHash(cart: any) {
  const q = quote(cart);
  return digest(
    JSON.stringify({
      cart: q.cart,
      total: q.total,
      terms: AGREEMENT_VERSION,
      agreementHash: AGREEMENT_HASH,
    }),
  );
}
export function billingAddress(c: any) {
  return {
    country: c.billingCountry,
    state: c.billingState,
    line1: c.billingAddress,
    line2: "",
    city: c.billingCity,
    postal_code: c.billingPostal,
  };
}
const canonicalAddress = (a: any) =>
  JSON.stringify(
    ["country", "state", "line1", "line2", "city", "postal_code"].map((k) =>
      String(a?.[k] || "")
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase(),
    ),
  );
export async function approvalForOrder(
  e: Env,
  d: Deps,
  o: any,
  allowClosed = false,
) {
  const a = await e.DB.prepare(
    "SELECT a.*,s.customer_json,s.scope_json,s.expires_at AS application_expires FROM application_approvals a JOIN service_applications s ON s.id=a.application_id WHERE a.order_id=?",
  )
    .bind(o.id)
    .first<any>();
  if (!a) {
    if (e.APP_ENV === "production")
      throw new Problem(409, "approved_application_required");
    return null;
  }
  if (
    a.revoked_at ||
    a.expires_at <= d.now() ||
    a.application_expires <= d.now()
  )
    throw new Problem(409, "approval_expired_or_revoked");
  const c = JSON.parse(a.customer_json),
    q = quote(JSON.parse(o.cart));
  if (
    a.customer_sha256 !== (await digest(JSON.stringify(c))) ||
    (await digest(o.customer)) !== a.customer_sha256 ||
    a.scope_sha256 !== (await digest(JSON.stringify(q))) ||
    a.quote_sha256 !== (await orderQuoteHash(q.cart)) ||
    a.terms_version !== AGREEMENT_VERSION ||
    a.terms_sha256 !== AGREEMENT_HASH ||
    (o.quote_hash && a.quote_sha256 !== o.quote_hash)
  )
    throw new Problem(409, "approval_scope_or_address_changed");
  if (!allowClosed && !approvedIntakeReady(e))
    throw new Problem(503, "approved_intake_closed");
  return a;
}
export async function approvalRoute(req: Request, e: ApprovalEnv, d: Deps) {
  const path = new URL(req.url).pathname;
  if (req.method !== "POST") throw new Problem(405, "method_not_allowed");
  if (req.headers.get("Origin") !== e.PUBLIC_SITE_ORIGIN)
    throw new Problem(403, "origin_denied");
  if (path === "/api/v1/approved-orders/redeem") {
    if (!approvedIntakeReady(e))
      throw new Problem(503, "approved_intake_closed");
    await rate(
      e,
      "approved-redeem:" + (req.headers.get("CF-Connecting-IP") || "local"),
      10,
      d.now(),
    );
    const b = object(await jsonBody(req));
    keys(b, ["invitation"]);
    if (
      typeof b.invitation !== "string" ||
      !/^[a-f0-9]{64}$/.test(b.invitation)
    )
      throw new Problem(400, "invalid_invitation");
    const a = await e.DB.prepare(
      "SELECT a.*,s.customer_json,s.scope_json,s.expires_at AS application_expires FROM application_approvals a JOIN service_applications s ON s.id=a.application_id WHERE a.invite_hash=?",
    )
      .bind(await digest(b.invitation))
      .first<any>();
    if (
      !a ||
      a.revoked_at ||
      a.redeemed_at ||
      a.expires_at <= d.now() ||
      a.application_expires <= d.now()
    )
      throw new Problem(410, "invitation_unavailable");
    const q = JSON.parse(a.scope_json),
      cap = token(),
      now = d.now();
    await approvalForOrder(e, d, {
      id: a.order_id,
      customer: a.customer_json,
      cart: JSON.stringify(q.cart),
    });
    await verifyWorkingRoot(e, d);
    const out = await e.DB.batch([
      e.DB.prepare(
        "INSERT INTO orders(id,token_hash,sku,cart,customer,subtotal,status,created_at,expires_at,updated_at) SELECT ?,?,?,?,?,?,'DRAFT',?,?,? WHERE EXISTS(SELECT 1 FROM application_approvals WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?) AND (SELECT COUNT(*) FROM orders WHERE expires_at>?)<20",
      ).bind(
        a.order_id,
        await digest(cap),
        q.cart.sku,
        JSON.stringify(q.cart),
        a.customer_json,
        q.total,
        now,
        now + TTL,
        now,
        a.id,
        now,
        now,
      ),
      e.DB.prepare(
        "UPDATE application_approvals SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=? AND token_hash=?)",
      ).bind(now, a.id, a.order_id, await digest(cap)),
    ]);
    if (!out[0].meta.changes) throw new Problem(409, "invitation_unavailable");
    return Response.json(
      {
        orderId: a.order_id,
        token: cap,
        expiresAt: now + TTL,
        status: "DRAFT",
        quote: q,
        approvedApplication: true,
      },
      { status: 201 },
    );
  }
  const actor = await admin(req, e, d),
    m = path.match(
      /^\/api\/v1\/admin\/applications\/([a-f0-9-]{36})\/(approve|revoke)$/,
    );
  if (!m) throw new Problem(404, "not_found");
  if (m[2] === "revoke") {
    await e.DB.prepare(
      "UPDATE application_approvals SET revoked_at=COALESCE(revoked_at,?),invalid_reason='operator_revoked' WHERE application_id=?",
    )
      .bind(d.now(), m[1])
      .run();
    return Response.json({ revoked: true });
  }
  const b = object(await jsonBody(req));
  keys(b, [
    "basisReference",
    "basisHash",
    "kind",
    "registrationId",
    "reasonCodes",
    "scopeReviewed",
    "pilotReady",
  ]);
  if (
    typeof b.basisReference !== "string" ||
    b.basisReference.trim().length < 8 ||
    b.basisReference.length > 500 ||
    !/^[a-f0-9]{64}$/.test(String(b.basisHash)) ||
    !["registered", "documented_no_collection"].includes(b.kind)
  )
    throw new Problem(400, "documented_tax_basis_required");
  if (
    !Array.isArray(b.reasonCodes) ||
    !b.reasonCodes.length ||
    b.reasonCodes.length > 8 ||
    b.reasonCodes.some(
      (r: any) =>
        ![
          "standard_rated",
          "reduced_rated",
          "zero_rated",
          "exempt",
          "reverse_charge",
          "not_collecting",
          "not_subject_to_tax",
          "product_exempt",
          "customer_exempt",
        ].includes(r),
    )
  )
    throw new Problem(400, "reviewed_tax_reasons_required");
  const s = await e.DB.prepare("SELECT * FROM service_applications WHERE id=?")
    .bind(m[1])
    .first<any>();
  if (!s || s.expires_at <= d.now())
    throw new Problem(404, "application_unavailable");
  const c = JSON.parse(s.customer_json),
    q = quote(JSON.parse(s.scope_json).cart);
  if (
    s.terms_version !== AGREEMENT_VERSION ||
    s.terms_sha256 !== AGREEMENT_HASH ||
    s.quote_sha256 !== (await digest(JSON.stringify(q)))
  )
    throw new Problem(409, "new_application_required");
  if (
    c.businessUse !== true ||
    b.scopeReviewed !== true ||
    (q.cart.sku === "p6_score_pilot" && b.pilotReady !== true)
  )
    throw new Problem(409, "scope_review_required");
  if (b.kind === "registered") {
    if (!/^taxreg_/.test(b.registrationId || ""))
      throw new Problem(400, "registration_required");
    const r = await stripe(
      e,
      d,
      "tax/registrations/" + encodeURIComponent(b.registrationId),
    );
    if (
      r.status !== "active" ||
      r.livemode !== (e.APP_ENV === "production") ||
      r.country !== c.billingCountry ||
      (r.country === "US" && r.country_options?.us?.state !== c.billingState)
    )
      throw new Problem(409, "registration_not_applicable");
  }
  const invitation = token(),
    approval = id(),
    now = d.now(),
    order = id();
  await e.DB.prepare(
    "INSERT INTO application_approvals(id,application_id,order_id,invite_hash,scope_sha256,quote_sha256,customer_sha256,terms_version,terms_sha256,basis_reference,basis_sha256,decision_json,approved_by,approved_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      approval,
      s.id,
      order,
      await digest(invitation),
      s.quote_sha256,
      await orderQuoteHash(q.cart),
      await digest(JSON.stringify(c)),
      AGREEMENT_VERSION,
      AGREEMENT_HASH,
      b.basisReference.trim(),
      b.basisHash,
      JSON.stringify({
        kind: b.kind,
        registrationId: b.kind === "registered" ? b.registrationId : null,
        reasonCodes: b.reasonCodes,
        scopeReviewed: true,
        pilotReady: b.pilotReady === true,
      }),
      actor,
      now,
      Math.min(s.expires_at, now + 7 * 86400),
    )
    .run();
  return Response.json({
    approved: true,
    approvalId: approval,
    orderId: order,
    invitationUrl:
      e.PUBLIC_SITE_ORIGIN + "/project-portal/#approved=" + invitation,
    intakeEnabled: approvedIntakeReady(e),
  });
}
export class ReviewRejected extends Problem {}
// Hosted Checkout can change an address. Authorize first, validate the final Stripe
// address against this exact review, then capture; never charge an unreviewed location.
export async function captureReviewed(e: Env, d: Deps, o: any, s: any, a: any) {
  if (!a) return s;
  const piId =
    typeof s.payment_intent === "string"
      ? s.payment_intent
      : s.payment_intent?.id;
  if (!piId || !/^pi_/.test(piId))
    throw new Problem(409, "payment_authorization_missing");
  const pi = await stripe(e, d, "payment_intents/" + piId);
  if (
    pi.livemode !== (e.APP_ENV === "production") ||
    pi.currency !== "usd" ||
    pi.amount !== s.amount_total ||
    pi.metadata?.order_id !== o.id ||
    pi.capture_method !== "manual"
  )
    throw new Problem(409, "authorization_not_bound");
  let invalid = "";
  try {
    await approvalForOrder(e, d, o, true);
    if (
      canonicalAddress(s.customer_details?.address) !==
      canonicalAddress(billingAddress(JSON.parse(a.customer_json)))
    )
      throw new Problem(409, "checkout_address_changed");
    const reasons = JSON.parse(a.decision_json).reasonCodes;
    if (taxEvidence(s).some((x: any) => !reasons.includes(x.taxability_reason)))
      throw new Problem(409, "tax_result_outside_review");
    if (s.consent?.terms_of_service !== "accepted")
      throw new Problem(409, "stripe_consent_not_verified");
  } catch (err) {
    invalid = err instanceof Problem ? err.code : "approval_validation_failed";
  }
  if (invalid) {
    await e.DB.prepare(
      "UPDATE application_approvals SET revoked_at=COALESCE(revoked_at,?),invalid_reason=COALESCE(invalid_reason,?) WHERE id=?",
    )
      .bind(d.now(), invalid, a.id)
      .run();
    const released =
      pi.status === "requires_capture"
        ? await stripe(
            e,
            d,
            "payment_intents/" + piId + "/cancel",
            new URLSearchParams(),
            "review-reject-" + piId,
          )
        : pi;
    if (released.status !== "canceled" || released.amount_received !== 0)
      throw new Problem(409, "authorization_release_pending");
    await e.DB.prepare(
      "UPDATE orders SET status='TAX_REVIEW_REQUIRED',updated_at=? WHERE id=? AND paid_at IS NULL",
    )
      .bind(d.now(), o.id)
      .run();
    throw new ReviewRejected(409, invalid);
  }
  if (pi.status === "requires_capture") {
    if (pi.amount_capturable !== s.amount_total)
      throw new Problem(409, "authorization_amount_mismatch");
    await stripe(
      e,
      d,
      "payment_intents/" + piId + "/capture",
      new URLSearchParams({ amount_to_capture: String(s.amount_total) }),
      "reviewed-capture-" + piId,
    );
  } else if (pi.status !== "succeeded")
    throw new Problem(409, "authorization_not_capturable");
  const paid = await stripe(
    e,
    d,
    "checkout/sessions/" + s.id + "?expand[]=total_details.breakdown",
  );
  if (
    paid.id !== s.id ||
    paid.livemode !== s.livemode ||
    paid.client_reference_id !== o.id ||
    paid.metadata?.quote_hash !== o.quote_hash ||
    paid.amount_subtotal !== s.amount_subtotal ||
    paid.amount_total !== s.amount_total ||
    paid.currency !== "usd" ||
    paid.consent?.terms_of_service !== "accepted" ||
    canonicalAddress(paid.customer_details?.address) !==
      canonicalAddress(s.customer_details?.address) ||
    paid.payment_status !== "paid" ||
    paid.status !== "complete"
  )
    throw new Problem(409, "capture_confirmation_pending");
  return paid;
}
