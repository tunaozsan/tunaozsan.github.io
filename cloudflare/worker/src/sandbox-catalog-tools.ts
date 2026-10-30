import { admin, defaults, type Env } from "./security";
import { stripe } from "./payments";
import { Problem } from "./catalog";
import { verifiedTransferPayment } from "./drive";
const ACCOUNT = "acct_1UVrQ3BxU4PsnoX0";
const MARKER = "CATALOG-EXTENDED-20261030";
const missing: Record<string, { name: string; amount: number }> = {
  "SCHEDULE-SCORE-PILOT": { name: "Schedule Score pilot", amount: 100 },
  "EXTRA-50-NR": {
    name: "Additional 50 activities Without Resources",
    amount: 10000,
  },
  "EXTRA-50-BASE-R": {
    name: "Additional 50 activities Baseline With Resources",
    amount: 17500,
  },
  "EXTRA-50-UPDATE-R": {
    name: "Additional 50 activities Update With Resources",
    amount: 15000,
  },
  REVISION: { name: "Additional in-scope revision", amount: 9900 },
  "BASELINE-MAT-CONCRETE": { name: "BASELINE-MAT-CONCRETE", amount: 24900 },
  "BASELINE-MAT-REBAR": { name: "BASELINE-MAT-REBAR", amount: 24900 },
  "BASELINE-MAT-FORMWORK": { name: "BASELINE-MAT-FORMWORK", amount: 24900 },
  "BASELINE-MAT-STRUCTURAL_STEEL": {
    name: "BASELINE-MAT-STRUCTURAL_STEEL",
    amount: 24900,
  },
  "BASELINE-MAT-PIPING": { name: "BASELINE-MAT-PIPING", amount: 24900 },
  "UPDATE-MAT-CONCRETE": { name: "UPDATE-MAT-CONCRETE", amount: 11900 },
  "UPDATE-MAT-REBAR": { name: "UPDATE-MAT-REBAR", amount: 11900 },
  "UPDATE-MAT-FORMWORK": { name: "UPDATE-MAT-FORMWORK", amount: 11900 },
  "UPDATE-MAT-STRUCTURAL_STEEL": {
    name: "UPDATE-MAT-STRUCTURAL_STEEL",
    amount: 11900,
  },
  "UPDATE-MAT-PIPING": { name: "UPDATE-MAT-PIPING", amount: 11900 },
};
export async function sandboxCatalogTools(
  req: Request,
  e: Env & { SANDBOX_CATALOG_TEST_UNTIL?: string },
) {
  try {
    const until = Number(e.SANDBOX_CATALOG_TEST_UNTIL);
    if (
      e.APP_ENV !== "test" ||
      !Number.isSafeInteger(until) ||
      until <= defaults.now() ||
      until > defaults.now() + 3600
    )
      throw new Problem(404, "not_found");
    await admin(req, e);
    if (
      req.method !== "POST" ||
      req.headers.get("Origin") !== e.PUBLIC_SITE_ORIGIN
    )
      throw new Problem(403, "origin_denied");
    if (
      e.STRIPE_ACCOUNT_ID !== ACCOUNT ||
      !e.STRIPE_SECRET_KEY?.startsWith("sk_test_")
    )
      throw new Problem(403, "sandbox_required");
    if ((await stripe(e, defaults, "account")).id !== ACCOUNT)
      throw new Problem(403, "wrong_account");
    const b: any = await req.json();
    const action = new URL(req.url).pathname.split("/").pop();
    const post = (path: string, data: Record<string, string>, key: string) =>
      stripe(e, defaults, path, new URLSearchParams(data), MARKER + "-" + key);
    let result: any;
    if (action === "refund-webhook-enable") {
      const endpoint = await stripe(
        e,
        defaults,
        "webhook_endpoints/we_1UVsLABxU4PsnoX0A0jmGtLe",
      );
      if (
        endpoint.livemode !== false ||
        endpoint.url !== e.PUBLIC_SITE_ORIGIN + "/api/v1/stripe/webhook"
      )
        throw new Problem(403, "endpoint_mismatch");
      const events = [
        ...new Set<string>([...endpoint.enabled_events, "charge.refunded"]),
      ];
      const data: Record<string, string> = {};
      events.forEach((name, i) => (data["enabled_events[" + i + "]"] = name));
      const updated = await post(
        "webhook_endpoints/" + endpoint.id,
        data,
        "refund-webhook-v1",
      );
      result = {
        id: updated.id,
        enabled_events: updated.enabled_events,
        api_version: updated.api_version,
        status: updated.status,
      };
    } else if (action === "provision") {
      const item = missing[b.sku];
      if (!item) throw new Problem(400, "sku_denied");
      // Retrieve all existing test products before creating; retry keys protect races.
      let products: any[] = [];
      let cursor = "";
      for (let n = 0; n < 20; n++) {
        const list = await stripe(
          e,
          defaults,
          "products?limit=100" + (cursor ? "&starting_after=" + cursor : ""),
        );
        products.push(...list.data);
        if (!list.has_more) break;
        if (n === 19) throw new Problem(409, "inventory_incomplete");
        cursor = list.data.at(-1).id;
      }
      const matches = products.filter(
        (x) => x.metadata?.sku === b.sku || x.name === item.name,
      );
      if (matches.length > 1) throw new Problem(409, "ambiguous_product");
      const product =
        matches[0] ||
        (await post(
          "products",
          {
            name: item.name,
            "metadata[sku]": b.sku,
            "metadata[purpose]": MARKER,
          },
          "product-" + b.sku,
        ));
      if (product.livemode !== false || !product.active)
        throw new Problem(409, "product_mismatch");
      const list = await stripe(
        e,
        defaults,
        "prices?product=" + product.id + "&limit=100",
      );
      if (list.has_more) throw new Problem(409, "inventory_incomplete");
      const prices = list.data.filter(
        (x: any) =>
          x.active &&
          x.unit_amount === item.amount &&
          x.currency === "usd" &&
          x.type === "one_time",
      );
      if (prices.length > 1) throw new Problem(409, "ambiguous_price");
      const price =
        prices[0] ||
        (await post(
          "prices",
          {
            product: product.id,
            unit_amount: String(item.amount),
            currency: "usd",
            lookup_key: b.sku,
            "metadata[sku]": b.sku,
            "metadata[purpose]": MARKER,
          },
          "price-" + b.sku,
        ));
      if (price.livemode !== false || price.lookup_key !== b.sku)
        throw new Problem(409, "lookup_key_review_required");
      result = {
        sku: b.sku,
        product_id: product.id,
        price_id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        active: price.active && product.active,
        createdProduct: !matches.length,
        createdPrice: !prices.length,
      };
    } else if (action === "link-status" || action === "link-close") {
      if (!/^plink_/.test(b.link)) throw new Problem(400, "invalid_link");
      const link = await stripe(e, defaults, "payment_links/" + b.link);
      if (link.livemode !== false || link.metadata?.purpose !== MARKER)
        throw new Problem(403, "fixture_required");
      const sessions = await stripe(
        e,
        defaults,
        "checkout/sessions?payment_link=" + link.id + "&limit=100",
      );
      if (action === "link-close")
        await post(
          "payment_links/" + link.id,
          { active: "false" },
          "close-" + link.id,
        );
      result = {
        link: link.id,
        active: action === "link-close" ? false : link.active,
        sessions: sessions.data.map((s: any) => ({
          id: s.id,
          status: s.status,
          payment_status: s.payment_status,
          consent: s.consent,
          order_id: s.metadata?.order_id,
        })),
      };
    } else {
      if (!/^[a-f0-9-]{36}$/.test(b.order))
        throw new Problem(400, "invalid_order");
      const o: any = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
        .bind(b.order)
        .first();
      const customer = o ? JSON.parse(o.customer) : {};
      if (
        customer.project !== MARKER ||
        customer.email !== "staging-tests@example.com"
      )
        throw new Problem(403, "fixture_required");
      if (action === "link-create") {
        if (o.paid_at) throw new Problem(409, "fixture_already_paid");
        const link = await post(
          "payment_links",
          {
            "line_items[0][price]": "price_1UVrQdBxU4PsnoX0jOEmafZV",
            "line_items[0][quantity]": "1",
            "consent_collection[terms_of_service]": "required",
            "metadata[purpose]": MARKER,
            "metadata[order_id]": o.id,
            "after_completion[type]": "redirect",
            "after_completion[redirect][url]":
              e.PUBLIC_SITE_ORIGIN + "/payment/success/",
          },
          "link-" + o.id,
        );
        if (link.livemode !== false) throw new Problem(403, "sandbox_required");
        result = { id: link.id, url: link.url };
      } else {
        if (!o.stripe_session_id) throw new Problem(404, "session_missing");
        const s = await stripe(
          e,
          defaults,
          "checkout/sessions/" + o.stripe_session_id,
        );
        if (s.livemode !== false || s.metadata?.order_id !== o.id)
          throw new Problem(403, "fixture_mismatch");
        if (action === "refund") {
          if (s.payment_status !== "paid" || !s.payment_intent)
            throw new Problem(409, "not_paid");
          const refund = await post(
            "refunds",
            { payment_intent: s.payment_intent, "metadata[purpose]": MARKER },
            "refund-" + o.id,
          );
          let gate = "UNEXPECTED_ALLOWED";
          try {
            await verifiedTransferPayment(e, o.id);
          } catch (err) {
            gate = err instanceof Problem ? err.code : "unexpected_error";
          }
          result = {
            refund_id: refund.id,
            status: refund.status,
            amount: refund.amount,
            fulfillmentGate: gate,
          };
        } else if (action === "expire") {
          if (s.payment_status === "paid")
            throw new Problem(409, "paid_session");
          const expired =
            s.status === "expired"
              ? s
              : await post(
                  "checkout/sessions/" + s.id + "/expire",
                  {},
                  "expire-" + o.id,
                );
          result = { session: expired.id, status: expired.status };
        } else if (action === "evidence") {
          const a: any = await e.DB.prepare(
            "SELECT agreement_version,agreement_sha256,scope_json,stripe_terms_status,stripe_session_id FROM agreement_acceptances WHERE order_id=?",
          )
            .bind(o.id)
            .first();
          const lines = await stripe(
            e,
            defaults,
            "checkout/sessions/" + s.id + "/line_items?limit=100",
          );
          result = {
            order: o.id,
            status: o.status,
            paid_at: o.paid_at,
            total: o.paid_total,
            acceptance: a,
            session: {
              id: s.id,
              status: s.status,
              payment_status: s.payment_status,
              amount_total: s.amount_total,
            },
            lines: lines.data.map((x: any) => ({
              price: x.price?.id,
              quantity: x.quantity,
              amount_total: x.amount_total,
            })),
          };
        } else throw new Problem(404, "not_found");
      }
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Problem ? err.code : "sandbox_validation_failed",
      },
      { status: err instanceof Problem ? err.status : 502 },
    );
  }
}
