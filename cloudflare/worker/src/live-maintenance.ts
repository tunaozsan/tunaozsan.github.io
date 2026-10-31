import { legacyLinks } from "./legacy-links";
import { admin, jsonBody, type Env, type Deps } from "./security";
import { keys, object, Problem } from "./catalog";
import { LIVE_ACCOUNT_ID } from "./live-catalog";
import { LIVE_WEBHOOK_EVENTS } from "./live-webhook-setup";

type MaintenanceEnv = Env & { LIVE_MAINTENANCE_UNTIL?: string };
const origin = "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev";
const webhookId = "we_1UWTAyBzdKYgwVw6TrMDvijt";
const sku = "EXTRA-50-UPDATE-R";
const name = "Additional 50 Activities — Update With MH & Cost";
// Bounded operator setup only. No arbitrary resource, URL, amount or secret input.
export async function liveMaintenance(
  req: Request,
  e: MaintenanceEnv,
  d: Deps,
) {
  const until = Number(e.LIVE_MAINTENANCE_UNTIL);
  if (
    e.APP_ENV !== "production" ||
    e.PUBLIC_SITE_ORIGIN !== origin ||
    !Number.isSafeInteger(until) ||
    until <= d.now() ||
    until > d.now() + 3600
  )
    throw new Problem(404, "maintenance_closed");
  await admin(req, e, d);
  if (req.method !== "POST") throw new Problem(405, "method_not_allowed");
  if (req.headers.get("Origin") !== origin)
    throw new Problem(403, "origin_denied");
  const b = object(await jsonBody(req));
  keys(b, ["action", "linkId"]);
  if (
    ![
      "refund-webhook",
      "missing-update-addon",
      "inspect-legacy-links",
      "retire-legacy-links",
    ].includes(b.action as string)
  )
    throw new Problem(400, "invalid_action");
  const key = e.STRIPE_SECRET_KEY?.trim() || "";
  if (
    e.STRIPE_ACCOUNT_ID !== LIVE_ACCOUNT_ID ||
    !/^(sk|rk)_live_[A-Za-z0-9]+$/.test(key)
  )
    throw new Problem(503, "verified_live_merchant_required");
  const api = async (
    path: string,
    body?: URLSearchParams,
    idempotency?: string,
  ) => {
    const r = await d.fetch("https://api.stripe.com/v1/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Stripe-Version": "2025-02-24.acacia",
        ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    // Provider errors may contain submitted values. Return only operation and HTTP status.
    if (!r.ok)
      throw new Problem(
        502,
        `stripe_${body ? "write" : "read"}_http_${r.status}`,
      );
    return (await r.json()) as any;
  };
  if ((await api("account")).id !== LIVE_ACCOUNT_ID)
    throw new Problem(503, "merchant_not_verified");
  if (
    b.action === "inspect-legacy-links" ||
    b.action === "retire-legacy-links"
  ) {
    if (b.action === "retire-legacy-links" && typeof b.linkId !== "string")
      throw new Problem(400, "single_link_required");
    return Response.json(
      await legacyLinks(
        api,
        b.action === "retire-legacy-links",
        b.linkId as string | undefined,
      ),
    );
  }
  if (b.action === "refund-webhook") {
    const w = await api("webhook_endpoints/" + webhookId);
    const matches = (v: any) =>
      v.id === webhookId &&
      v.livemode === true &&
      v.url === origin + "/api/v1/stripe/webhook" &&
      v.status === "enabled" &&
      v.api_version === "2025-02-24.acacia" &&
      Array.isArray(v.enabled_events) &&
      LIVE_WEBHOOK_EVENTS.every((x) => v.enabled_events.includes(x));
    if (!matches(w)) throw new Problem(409, "webhook_configuration_changed");
    let result = w;
    if (!w.enabled_events.includes("charge.refunded")) {
      const body = new URLSearchParams();
      [...new Set([...w.enabled_events, "charge.refunded"])].forEach((x, i) =>
        body.set(`enabled_events[${i}]`, String(x)),
      );
      result = await api(
        "webhook_endpoints/" + webhookId,
        body,
        "bluefin-refund-events-v1",
      );
    }
    if (!matches(result) || !result.enabled_events.includes("charge.refunded"))
      throw new Problem(502, "webhook_update_not_verified");
    return Response.json({
      action: b.action,
      endpoint: result.id,
      events: result.enabled_events,
      apiVersion: result.api_version,
      verified: true,
    });
  }
  const list = async (path: string) => {
    let cursor = "";
    const all: any[] = [];
    for (let i = 0; i < 10; i++) {
      const page = await api(
        path +
          "?" +
          new URLSearchParams({
            limit: "100",
            ...(cursor ? { starting_after: cursor } : {}),
          }),
      );
      if (!Array.isArray(page.data))
        throw new Problem(502, "catalog_inventory_invalid");
      all.push(...page.data);
      if (!page.has_more) return all;
      cursor = page.data.at(-1)?.id;
      if (!cursor) break;
    }
    throw new Problem(409, "catalog_inventory_incomplete");
  };
  const [products, prices] = await Promise.all([
    list("products"),
    list("prices"),
  ]);
  const candidates = products.filter(
    (p) => p.metadata?.sku === sku || p.name === name,
  );
  if (candidates.length > 1)
    throw new Problem(409, "duplicate_catalog_product");
  let product = candidates[0];
  if (!product && prices.some((p) => p.lookup_key === sku))
    throw new Problem(409, "existing_catalog_price_needs_mapping");
  if (
    product &&
    (product.livemode !== true ||
      !product.active ||
      product.name !== name ||
      product.metadata?.sku !== sku)
  )
    throw new Problem(409, "existing_catalog_product_needs_mapping");
  // Use permanent operation keys: interrupted setup may be resumed without creating duplicates.
  product ||= await api(
    "products",
    new URLSearchParams({ name, "metadata[sku]": sku }),
    "bluefin-live-product-" + sku,
  );
  if (
    product.livemode !== true ||
    !product.active ||
    product.metadata?.sku !== sku
  )
    throw new Problem(502, "created_product_not_verified");
  const possible = prices.filter(
    (p) => p.lookup_key === sku || p.product === product.id,
  );
  if (possible.length > 1) throw new Problem(409, "multiple_catalog_prices");
  const price =
    possible[0] ||
    (await api(
      "prices",
      new URLSearchParams({
        product: product.id,
        unit_amount: "15000",
        currency: "usd",
        lookup_key: sku,
      }),
      "bluefin-live-price-" + sku,
    ));
  if (
    price.livemode !== true ||
    !price.active ||
    price.unit_amount !== 15000 ||
    price.currency !== "usd" ||
    price.type !== "one_time" ||
    price.product !== product.id ||
    price.lookup_key !== sku
  )
    throw new Problem(409, "catalog_price_mismatch");
  return Response.json({
    action: b.action,
    sku,
    product: product.id,
    price: price.id,
    amount: price.unit_amount,
    currency: price.currency,
    verified: true,
  });
}
