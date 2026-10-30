import { Problem, object, keys, quote } from "./catalog";
import {
  AGREEMENT_VERSION,
  AGREEMENT_HASH,
  AGREEMENT_STATUS,
} from "./agreement";
import {
  type Env,
  type Deps,
  admin,
  authConfigured,
  jsonBody,
  rate,
  digest,
  id,
} from "./security";
export type ApplicationEnv = Env & { APPLICATIONS_ENABLED?: string };
export function applicationsReady(e: ApplicationEnv) {
  return (
    e.APP_ENV === "production" &&
    e.APPLICATIONS_ENABLED === "true" &&
    e.LEGAL_APPROVED === "true" &&
    AGREEMENT_STATUS === "APPROVED" &&
    authConfigured(e) &&
    !!e.TURNSTILE_SECRET_KEY &&
    (e.RATE_LIMIT_SALT?.length || 0) >= 32
  );
}
export async function applications(
  req: Request,
  e: ApplicationEnv,
  d: Deps,
): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === "/api/v1/admin/applications" && req.method === "GET") {
    await admin(req, e, d);
    const rows = await e.DB.prepare(
      "SELECT * FROM service_applications ORDER BY created_at DESC LIMIT 100",
    ).all();
    return Response.json({
      applications: rows.results,
      checkoutEnabled: false,
    });
  }
  if (req.method !== "POST") throw new Problem(405, "method_not_allowed");
  if (!applicationsReady(e)) throw new Problem(503, "applications_closed");
  if (req.headers.get("origin") !== e.PUBLIC_SITE_ORIGIN)
    throw new Problem(403, "origin_denied");
  await rate(
    e,
    "application:" + (req.headers.get("CF-Connecting-IP") || "local"),
    5,
    d.now(),
  );
  const body = object(await jsonBody(req));
  keys(body, ["cart", "customer", "acceptance", "turnstileToken"]);
  const q = quote(body.cart),
    a = object(body.acceptance);
  keys(a, ["accepted", "version", "hash", "quoteHash"]);
  if (a.accepted !== true) throw new Problem(400, "agreement_required");
  if (a.version !== AGREEMENT_VERSION || a.hash !== AGREEMENT_HASH)
    throw new Problem(409, "agreement_changed");
  const scope = JSON.stringify(q),
    quoteHash = await digest(scope);
  if (a.quoteHash !== quoteHash) throw new Problem(409, "scope_changed");
  const c = object(body.customer);
  keys(c, [
    "name",
    "email",
    "project",
    "dataDate",
    "businessUse",
    "businessName",
    "billingCountry",
    "billingState",
    "billingAddress",
    "billingCity",
    "billingPostal",
    "projectCountry",
  ]);
  if (typeof c.businessUse !== "boolean")
    throw new Problem(400, "business_use_required");
  const customer: Record<string, string | boolean> = {
    businessUse: c.businessUse,
  };
  for (const [key, max] of Object.entries({
    name: 100,
    email: 254,
    project: 160,
    dataDate: 10,
    businessName: 160,
    billingCountry: 2,
    billingState: 100,
    billingAddress: 240,
    billingCity: 100,
    billingPostal: 32,
    projectCountry: 2,
  })) {
    const value = c[key];
    const optional =
      (key === "dataDate" && !q.cart.sku.startsWith("update")) ||
      (key === "businessName" && !c.businessUse);
    if (
      typeof value !== "string" ||
      value.length > max ||
      /[\x00-\x1f]/.test(value) ||
      (!optional && !value.trim())
    )
      throw new Problem(400, "invalid_customer");
    customer[key] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email)))
    throw new Problem(400, "invalid_email");
  for (const key of ["billingCountry", "projectCountry"]) {
    if (!/^[A-Za-z]{2}$/.test(String(customer[key])))
      throw new Problem(400, "invalid_country");
    customer[key] = String(customer[key]).toUpperCase();
  }
  if (
    customer.dataDate &&
    !/^\d{4}-\d{2}-\d{2}$/.test(String(customer.dataDate))
  )
    throw new Problem(400, "invalid_data_date");
  if (
    typeof body.turnstileToken !== "string" ||
    !body.turnstileToken ||
    body.turnstileToken.length > 2048
  )
    throw new Problem(400, "challenge_required");
  const check = await d.fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: e.TURNSTILE_SECRET_KEY!,
        response: body.turnstileToken,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const challenge = (await check.json()) as any;
  if (
    !check.ok ||
    challenge.success !== true ||
    challenge.hostname !== new URL(e.PUBLIC_SITE_ORIGIN).hostname ||
    challenge.action !== "create-order"
  )
    throw new Problem(403, "challenge_failed");
  const reasons = [
    "Applicable transaction-tax rule and billing/project facts require review.",
    ...q.scopeReview,
  ];
  if (!customer.businessUse)
    reasons.push(
      "Consumer disclosures and early-performance requirements require review before charging.",
    );
  const reference = id(),
    now = d.now();
  await e.DB.prepare(
    "INSERT INTO service_applications(id,customer_json,scope_json,quote_sha256,terms_version,terms_sha256,accepted_at,created_at,expires_at,review_reasons_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      reference,
      JSON.stringify(customer),
      scope,
      quoteHash,
      AGREEMENT_VERSION,
      AGREEMENT_HASH,
      now,
      now,
      now + 30 * 86400,
      JSON.stringify(reasons),
    )
    .run();
  return Response.json(
    {
      applicationId: reference,
      status: "TAX_REVIEW_REQUIRED",
      quote: q,
      termsVersion: AGREEMENT_VERSION,
      termsHash: AGREEMENT_HASH,
      acceptedAt: now,
      charged: false,
      filesEnabled: false,
      reviewReasons: reasons,
    },
    { status: 201 },
  );
}
export async function applicationCleanup(e: ApplicationEnv, d: Deps) {
  // Application validity: 30 days. Minimize 90 days AFTER expiry; documented holds prevent deletion.
  // Never delete orders/financial or accepted payment records here.
  await e.DB.prepare(
    "DELETE FROM service_applications WHERE expires_at+7776000<=? AND status='TAX_REVIEW_REQUIRED' AND hold_reason IS NULL",
  )
    .bind(d.now())
    .run();
}
