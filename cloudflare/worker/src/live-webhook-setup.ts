import { admin, jsonBody, type Deps, type Env } from "./security";
import { object, keys, Problem } from "./catalog";
import { stripe } from "./payments";
import { LIVE_ACCOUNT_ID } from "./live-catalog";
export type LiveSetupEnv = Env & {
  LIVE_WEBHOOK_SETUP_ID?: string;
  LIVE_WEBHOOK_SETUP_EXPIRES?: string;
  LIVE_WEBHOOK_SETUP_PUBLIC_JWK?: string;
};
export const LIVE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];
// Short-lived admin-only bootstrap. The plaintext signing secret never leaves
// the Worker except encrypted to the deployment operator's pinned public key.
// The local private key imports it directly into Cloudflare Worker Secrets.
export async function setupLiveWebhook(req: Request, e: LiveSetupEnv, d: Deps) {
  const until = Number(e.LIVE_WEBHOOK_SETUP_EXPIRES);
  if (
    e.APP_ENV !== "production" ||
    !Number.isSafeInteger(until) ||
    until <= d.now() ||
    until > d.now() + 3600 ||
    !/^[a-f0-9-]{36}$/.test(e.LIVE_WEBHOOK_SETUP_ID || "")
  )
    throw new Problem(404, "setup_closed");
  await admin(req, e, d);
  if (req.method !== "POST") throw new Problem(405, "method_not_allowed");
  if (req.headers.get("origin") !== e.PUBLIC_SITE_ORIGIN)
    throw new Problem(403, "origin_denied");
  keys(object(await jsonBody(req)), []);
  if (
    e.STRIPE_ACCOUNT_ID !== LIVE_ACCOUNT_ID ||
    !/^(sk|rk)_live_[A-Za-z0-9]+$/.test(e.STRIPE_SECRET_KEY?.trim() || "")
  )
    throw new Problem(503, "verified_live_merchant_required");
  const account = await stripe(e, d, "account");
  if (account.id !== LIVE_ACCOUNT_ID || account.charges_enabled !== true)
    throw new Problem(503, "merchant_not_verified");
  const jwk = JSON.parse(
    e.LIVE_WEBHOOK_SETUP_PUBLIC_JWK || "null",
  ) as JsonWebKey | null;
  if (
    !jwk ||
    jwk.kty !== "RSA" ||
    jwk.e !== "AQAB" ||
    !/^[A-Za-z0-9_-]{683}$/.test(jwk.n || "") ||
    jwk.d
  )
    throw new Problem(503, "setup_public_key_invalid");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const url = e.PUBLIC_SITE_ORIGIN + "/api/v1/stripe/webhook";
  const marker = "bluefin-live-" + e.LIVE_WEBHOOK_SETUP_ID;
  const existing = await stripe(e, d, "webhook_endpoints?limit=100");
  if (existing.has_more || !Array.isArray(existing.data))
    throw new Problem(409, "webhook_inventory_incomplete");
  const matches = existing.data.filter(
    (x: any) => x.url === url && x.livemode === true,
  );
  if (matches.length > 1)
    throw new Problem(409, "multiple_production_webhooks");
  if (e.STRIPE_WEBHOOK_SECRET && matches.length === 1) {
    if (
      matches[0].status !== "enabled" ||
      LIVE_WEBHOOK_EVENTS.some(
        (event) => !matches[0].enabled_events?.includes(event),
      )
    )
      throw new Problem(409, "existing_webhook_needs_review");
    return Response.json({ configured: true, endpoint: matches[0].id });
  }
  if (matches.length && matches[0].metadata?.setup !== marker)
    throw new Problem(409, "existing_webhook_requires_its_signing_secret");
  const body = new URLSearchParams({
    url,
    api_version: "2025-02-24.acacia",
    description: "Bluefin Tuna production portal",
    "metadata[setup]": marker,
  });
  LIVE_WEBHOOK_EVENTS.forEach((event, i) =>
    body.set(`enabled_events[${i}]`, event),
  );
  // Identical replay recovers Stripe's original creation response without
  // producing a duplicate endpoint after a browser or network interruption.
  const endpoint = await stripe(e, d, "webhook_endpoints", body, marker);
  if (
    endpoint.livemode !== true ||
    endpoint.url !== url ||
    endpoint.status !== "enabled" ||
    endpoint.api_version !== "2025-02-24.acacia" ||
    LIVE_WEBHOOK_EVENTS.some(
      (event) => !endpoint.enabled_events?.includes(event),
    ) ||
    !/^we_[A-Za-z0-9]+$/.test(endpoint.id || "") ||
    !/^whsec_[A-Za-z0-9]+$/.test(endpoint.secret || "")
  )
    throw new Problem(502, "webhook_setup_response_invalid");
  const context = `bluefin:${LIVE_ACCOUNT_ID}:${endpoint.id}:${e.LIVE_WEBHOOK_SETUP_ID}`;
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "RSA-OAEP", label: new TextEncoder().encode(context) },
      publicKey,
      new TextEncoder().encode(endpoint.secret),
    ),
  );
  return Response.json({
    version: 1,
    account: LIVE_ACCOUNT_ID,
    worker: "bluefin-project-portal-api",
    generation: e.LIVE_WEBHOOK_SETUP_ID,
    endpoint: endpoint.id,
    url,
    apiVersion: endpoint.api_version,
    events: endpoint.enabled_events,
    encryptedSecret: btoa(String.fromCharCode(...encrypted)),
  });
}
