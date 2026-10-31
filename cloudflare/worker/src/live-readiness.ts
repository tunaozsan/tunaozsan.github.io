import { admin, type Deps, type Env } from "./security";
import { Problem } from "./catalog";

// Read-only diagnostics behind the existing admin Access/JWT policy. Never
// return raw provider objects: account PII, secrets and customer data stay out.
export async function liveReadiness(req: Request, e: Env, d: Deps) {
  await admin(req, e, d);
  if (req.method !== "GET") throw new Problem(405, "method_not_allowed");
  if (e.APP_ENV !== "production") throw new Problem(503, "production_required");
  const key = e.STRIPE_SECRET_KEY?.trim() || "";
  if (!key) throw new Problem(503, "live_stripe_key_missing");
  if (/^pk_/.test(key))
    throw new Problem(503, "publishable_key_cannot_create_checkout");
  if (/^(sk|rk)_test_/.test(key))
    throw new Problem(503, "sandbox_key_cannot_access_live");
  if (!/^(sk|rk)_live_[A-Za-z0-9]+$/.test(key))
    throw new Problem(503, "invalid_stripe_live_key_format");
  const get = async (path: string) => {
    const r = await d.fetch("https://api.stripe.com/v1/" + path, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Stripe-Version": "2025-02-24.acacia",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Problem(502, "stripe_read_http_" + r.status);
    return (await r.json()) as any;
  };
  const list = async (path: string) => {
    const all: any[] = [];
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const q = new URLSearchParams({
        limit: "100",
        ...(cursor ? { starting_after: cursor } : {}),
      });
      if (path === "prices") q.set("expand[]", "data.product");
      const result = await get(path + "?" + q);
      if (!Array.isArray(result.data))
        throw new Problem(502, "stripe_invalid_inventory");
      all.push(...result.data);
      if (!result.has_more) return all;
      cursor = result.data.at(-1)?.id;
      if (!cursor) break;
    }
    throw new Problem(502, "stripe_inventory_incomplete");
  };
  const account = await get("account");
  if (
    !/^acct_[A-Za-z0-9]+$/.test(account.id) ||
    account.id === "acct_1UVrQ3BxU4PsnoX0"
  )
    throw new Problem(503, "live_merchant_required");
  if (e.STRIPE_ACCOUNT_ID && account.id !== e.STRIPE_ACCOUNT_ID)
    throw new Problem(503, "merchant_not_verified");
  const read = async (action: () => Promise<unknown>) => {
    try {
      return { result: "PASS", data: await action() };
    } catch (error) {
      return {
        result: "FAIL",
        error:
          error instanceof Problem ? error.code : "stripe_read_unavailable",
      };
    }
  };
  const [prices, registrations, taxSettings, webhooks, links] =
    await Promise.all([
      read(async () =>
        (await list("prices")).map((p) => ({
          id: p.id,
          active: p.active,
          livemode: p.livemode,
          type: p.type,
          unit_amount: p.unit_amount,
          currency: p.currency,
          lookup_key: p.lookup_key,
          tax_behavior: p.tax_behavior,
          product:
            typeof p.product === "object"
              ? {
                  id: p.product.id,
                  name: p.product.name,
                  active: p.product.active,
                  livemode: p.product.livemode,
                  sku: p.product.metadata?.sku || null,
                  tax_code: p.product.tax_code,
                }
              : { id: p.product },
        })),
      ),
      read(async () =>
        (await list("tax/registrations")).map((r) => ({
          id: r.id,
          status: r.status,
          country: r.country,
          livemode: r.livemode,
          state: r.country_options?.us?.state || null,
          type: r.country_options?.us?.type || null,
          active_from: r.active_from,
          expires_at: r.expires_at,
        })),
      ),
      read(async () => {
        const t = await get("tax/settings");
        return {
          status: t.status,
          livemode: t.livemode,
          defaults: {
            tax_code: t.defaults?.tax_code,
            tax_behavior: t.defaults?.tax_behavior,
          },
          country: t.head_office?.address?.country,
          state: t.head_office?.address?.state,
        };
      }),
      read(async () =>
        (await list("webhook_endpoints"))
          .filter(
            (w) => w.url === e.PUBLIC_SITE_ORIGIN + "/api/v1/stripe/webhook",
          )
          .map((w) => ({
            id: w.id,
            url: w.url,
            status: w.status,
            livemode: w.livemode,
            api_version: w.api_version,
            enabled_events: w.enabled_events,
          })),
      ),
      read(async () =>
        (await list("payment_links")).map((l) => ({
          id: l.id,
          url: l.url,
          active: l.active,
          livemode: l.livemode,
          termsRequired: l.consent_collection?.terms_of_service === "required",
          automaticTax: l.automatic_tax?.enabled === true,
        })),
      ),
    ]);
  return Response.json({
    checkedAt: d.now(),
    mode: "production",
    restVersion: "2025-02-24.acacia",
    account: {
      id: account.id,
      businessName:
        account.business_profile?.name || account.company?.name || null,
      country: account.country,
      chargesEnabled: account.charges_enabled,
      configuredAccountMatches: e.STRIPE_ACCOUNT_ID
        ? account.id === e.STRIPE_ACCOUNT_ID
        : null,
    },
    webhookSecretConfigured: !!e.STRIPE_WEBHOOK_SECRET,
    checkoutEnabled: false,
    prices,
    registrations,
    taxSettings,
    webhooks,
    links,
  });
}
