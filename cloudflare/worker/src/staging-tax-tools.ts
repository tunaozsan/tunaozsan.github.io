import { admin, defaults, digest, token, type Env } from "./security";
import { checkout, quoteOrder, stripe } from "./payments";
import { CONSULTING_TAX_CODE, STRIPE_REST_VERSION } from "./tax";
import { Problem, TTL, TERMS } from "./catalog";
import { upload } from "./storage";
import { sandboxPrices } from "./stripe-catalog";
const ACCOUNT = "acct_1UVrQ3BxU4PsnoX0";
const ORIGIN =
  "https://bluefin-project-portal-staging.bluefintuna-llc.workers.dev";
const MARKER = "TAX-BASIC-20261031";
const PREFIX = "/api/v1/admin/tax-test/";
const page = `<!doctype html><meta charset="utf-8"><title>Bluefin Sandbox Tax Verification</title>
<style>body{font:17px system-ui;margin:3rem;max-width:1000px;background:#edf4fa;color:#142b42}button,input{font:inherit;padding:12px;margin:5px}pre{white-space:pre-wrap}label{display:block}</style>
<h1>Stripe Tax · isolated Sandbox</h1><p>Synthetic fixtures only. No live payments. Customer intake stays closed.</p>
<button data-action="inspect">Inspect tax setup</button><button data-action="setup">Configure synthetic SD tax registration</button>
<button data-action="catalog">Set existing Sandbox catalog tax codes</button>
<hr><label>Scenario <input id="scenario" value="taxed" pattern="taxed|zero|missing|cancel"></label>
<label><input type="checkbox" id="consent"> Accept current service terms for this synthetic test order</label>
<button data-action="create">Create synthetic Checkout</button><a id="checkout" hidden>Open Sandbox Checkout</a>
<label>Order <input id="order" size="40"></label><button data-action="evidence">Read verified evidence</button><button data-action="refund">Refund synthetic payment</button><button data-action="expire">Expire unpaid synthetic session</button>
<pre id="result" aria-live="polite"></pre><script>
for(const button of document.querySelectorAll('button')) button.onclick=async()=>{
button.disabled=true;const out=document.querySelector('#result');out.textContent='Working…';
try{const r=await fetch('${PREFIX}'+button.dataset.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:document.querySelector('#scenario').value,consent:document.querySelector('#consent').checked,order:document.querySelector('#order').value})});const data=await r.json();
if(data.url){const a=document.querySelector('#checkout');a.href=data.url;a.hidden=false;delete data.url;}if(data.orderId)document.querySelector('#order').value=data.orderId;out.textContent=JSON.stringify({http:r.status,...data},null,2);
}catch(e){out.textContent='Request failed; renew Access in this browser if needed.';}finally{button.disabled=false;}};
</script>`;
export async function stagingTaxTools(
  req: Request,
  e: Env & { STAGING_TAX_TEST_UNTIL?: string },
) {
  try {
    const until = Number(e.STAGING_TAX_TEST_UNTIL);
    if (
      e.APP_ENV !== "test" ||
      e.PUBLIC_SITE_ORIGIN !== ORIGIN ||
      !Number.isSafeInteger(until) ||
      until <= defaults.now() ||
      until > defaults.now() + 3600
    )
      throw new Problem(404, "test_window_closed");
    await admin(req, e);
    if (req.method === "GET" && new URL(req.url).pathname === PREFIX)
      return new Response(page, {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex",
        },
      });
    if (req.method !== "POST" || req.headers.get("Origin") !== ORIGIN)
      throw new Problem(403, "origin_denied");
    if (
      e.STRIPE_ACCOUNT_ID !== ACCOUNT ||
      !e.STRIPE_SECRET_KEY?.startsWith("sk_test_")
    )
      throw new Problem(403, "sandbox_required");
    if ((await stripe(e, defaults, "account")).id !== ACCOUNT)
      throw new Problem(403, "wrong_account");
    const b: any = await req.json();
    const action = new URL(req.url).pathname.slice(PREFIX.length);
    // No arbitrary API proxy, live endpoint, card data, credentials, or key export.
    async function api(
      path: string,
      params?: Record<string, string>,
      key?: string,
    ) {
      const r = await fetch("https://api.stripe.com/v1/" + path, {
        method: params ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + e.STRIPE_SECRET_KEY,
          "Stripe-Version": STRIPE_REST_VERSION,
          ...(key ? { "Idempotency-Key": MARKER + "-" + key } : {}),
        },
        body: params ? new URLSearchParams(params) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      const j: any = await r.json();
      if (!r.ok)
        throw new Problem(
          502,
          "stripe_http_" +
            r.status +
            "_" +
            (j.error?.code || j.error?.type || "unknown"),
        );
      if (j.livemode === true) throw new Problem(403, "live_object_denied");
      return j;
    }
    let result: any;
    if (action === "inspect" || action === "setup") {
      let settings = await api("tax/settings");
      let regs = await api("tax/registrations?limit=100");
      if (regs.has_more)
        throw new Problem(409, "registration_inventory_incomplete");
      if (action === "setup") {
        const p: Record<string, string> = {
          "defaults[tax_code]": CONSULTING_TAX_CODE,
          "defaults[tax_behavior]": "exclusive",
        };
        // Isolated test head office only; never pretend this is the live business location.
        if (!settings.head_office?.address?.country)
          Object.assign(p, {
            "head_office[address][country]": "US",
            "head_office[address][state]": "SD",
            "head_office[address][city]": "Sioux Falls",
            "head_office[address][postal_code]": "57104",
            "head_office[address][line1]": "224 W 9th St",
          });
        settings = await api("tax/settings", p, "settings");
        if (
          !regs.data.some(
            (r: any) =>
              r.country === "US" &&
              r.country_options?.us?.state === "SD" &&
              r.status === "active",
          )
        )
          await api(
            "tax/registrations",
            {
              country: "US",
              "country_options[us][state]": "SD",
              "country_options[us][type]": "state_sales_tax",
              active_from: "now",
            },
            "synthetic-sd-registration",
          );
        regs = await api("tax/registrations?limit=100");
      }
      result = {
        account: ACCOUNT,
        mode: "test",
        settings: {
          status: settings.status,
          defaults: settings.defaults,
          missing_fields: settings.status_details?.pending?.missing_fields,
        },
        registrations: regs.data.map((r: any) => ({
          id: r.id,
          country: r.country,
          options: r.country_options,
          status: r.status,
          livemode: r.livemode,
        })),
      };
    } else if (action === "catalog") {
      const list = await api(
        "prices?limit=100&active=true&expand[]=data.product",
      );
      if (list.has_more) throw new Problem(409, "catalog_inventory_incomplete");
      const extra = [
        "SCHEDULE-SCORE-PILOT",
        "EXTRA-50-NR",
        "EXTRA-50-BASE-R",
        "EXTRA-50-UPDATE-R",
        "REVISION",
        ...["BASELINE", "UPDATE"].flatMap((p) =>
          ["CONCRETE", "REBAR", "FORMWORK", "STRUCTURAL_STEEL", "PIPING"].map(
            (m) => p + "-MAT-" + m,
          ),
        ),
      ];
      const prices = list.data.filter(
        (p: any) =>
          Object.values(sandboxPrices).some(
            (m) => m.price === p.id && m.product === p.product?.id,
          ) || extra.includes(p.lookup_key),
      );
      if (prices.length !== 22)
        throw new Problem(409, "expected_22_existing_prices");
      const changed = [];
      for (const p of prices) {
        if (
          p.livemode !== false ||
          p.product?.livemode !== false ||
          p.currency !== "usd" ||
          p.type !== "one_time" ||
          !p.product.active ||
          !["exclusive", "unspecified"].includes(p.tax_behavior)
        )
          throw new Problem(409, "catalog_review_required");
        let verifiedProduct = p.product,
          verified = p;
        if (p.product.tax_code !== CONSULTING_TAX_CODE)
          verifiedProduct = await api(
            "products/" + p.product.id,
            { tax_code: CONSULTING_TAX_CODE },
            "product-" + p.product.id,
          );
        if (p.tax_behavior !== "exclusive")
          verified = await api(
            "prices/" + p.id,
            { tax_behavior: "exclusive" },
            "price-" + p.id,
          );
        if (
          verified.unit_amount !== p.unit_amount ||
          verified.currency !== p.currency ||
          verified.tax_behavior !== "exclusive" ||
          verifiedProduct.tax_code !== CONSULTING_TAX_CODE
        )
          throw new Problem(409, "catalog_verification_failed");
        changed.push({
          price: p.id,
          product: p.product.id,
          amount: p.unit_amount,
          currency: p.currency,
          tax_behavior: verified.tax_behavior,
          tax_code: verifiedProduct.tax_code,
        });
      }
      result = { existingPrices: changed, noProductsOrPricesCreated: true };
    } else if (action === "create") {
      if (
        !["taxed", "zero", "missing", "cancel"].includes(b.scenario) ||
        b.consent !== true
      )
        throw new Problem(400, "synthetic_consent_required");
      // Admin-generated synthetic intake exercises real upload/quote/consent/Checkout functions.
      // Public Turnstile is not bypassed or enabled by this separate fixture endpoint.
      const count: any = await e.DB.prepare(
        "SELECT COUNT(*) n FROM orders WHERE json_extract(customer,'$.project')=? AND created_at>?",
      )
        .bind(MARKER, defaults.now() - 86400)
        .first();
      if (count.n >= 8) throw new Problem(409, "fixture_limit");
      const id = crypto.randomUUID(),
        now = defaults.now(),
        cart = {
          sku: "p6_audit",
          activities: 150,
          revisions: 0,
          materials: [],
          existingResources: false,
        };
      await e.DB.prepare(
        "INSERT INTO orders(id,token_hash,sku,cart,customer,subtotal,created_at,expires_at,updated_at) VALUES (?,?,?,?,?,19900,?,?,?)",
      )
        .bind(
          id,
          await digest(token()),
          "p6_audit",
          JSON.stringify(cart),
          JSON.stringify({
            name: "Synthetic Tax " + b.scenario,
            email: "staging-tests@example.com",
            project: MARKER,
            dataDate: "2026-10-31",
          }),
          now,
          now + TTL,
          now,
        )
        .run();
      let o: any = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
        .bind(id)
        .first();
      await upload(
        new Request(ORIGIN, {
          method: "POST",
          headers: {
            "x-file-name": "synthetic-tax.xer",
            "x-file-category": "xer",
            "content-type": "text/plain",
          },
          body: "ERMHDR\t20\tSYNTHETIC TAX BASIC TEST\n",
        }),
        e,
        o,
        defaults,
      );
      const q = await quoteOrder(e, defaults, o);
      o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
        .bind(id)
        .first();
      const session = await checkout(
        { ...e, TAX_MODE: "automatic", INVOICE_CREATION: "true" },
        defaults,
        o,
        { consent: true, termsVersion: TERMS, quoteHash: q.quoteHash },
      );
      result = { orderId: id, scenario: b.scenario, ...session };
    } else {
      if (!/^[a-f0-9-]{36}$/.test(b.order || ""))
        throw new Problem(400, "invalid_order");
      const o: any = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
        .bind(b.order)
        .first();
      if (
        !o ||
        JSON.parse(o.customer).project !== MARKER ||
        !o.stripe_session_id
      )
        throw new Problem(403, "fixture_required");
      const s = await api(
        "checkout/sessions/" +
          o.stripe_session_id +
          "?expand[]=total_details.breakdown",
      );
      if (s.livemode !== false || s.metadata?.order_id !== o.id)
        throw new Problem(403, "fixture_mismatch");
      if (action === "refund") {
        if (s.payment_status !== "paid" || !s.payment_intent)
          throw new Problem(409, "not_paid");
        const r = await api(
          "refunds",
          { payment_intent: s.payment_intent, "metadata[purpose]": MARKER },
          "refund-" + o.id,
        );
        result = { refund: r.id, status: r.status, amount: r.amount };
      } else if (action === "expire") {
        if (s.payment_status === "paid") throw new Problem(409, "paid_session");
        const r =
          s.status === "expired"
            ? s
            : await api(
                "checkout/sessions/" + s.id + "/expire",
                {},
                "expire-" + o.id,
              );
        result = { session: r.id, status: r.status };
      } else if (action === "evidence") {
        result = {
          order: {
            id: o.id,
            status: o.status,
            paid_at: o.paid_at,
            subtotal: o.subtotal,
            tax: o.paid_tax,
            total: o.paid_total,
          },
          session: {
            id: s.id,
            livemode: s.livemode,
            status: s.status,
            payment_status: s.payment_status,
            automatic_tax: s.automatic_tax,
            billing_address_collection: s.billing_address_collection,
            tax_id_collection: s.tax_id_collection,
            subtotal: s.amount_subtotal,
            total: s.amount_total,
            total_details: s.total_details,
            invoice: s.invoice,
          },
          taxEvidence: await e.DB.prepare(
            "SELECT * FROM payment_tax_evidence WHERE order_id=?",
          )
            .bind(o.id)
            .first(),
          events: (
            await e.DB.prepare("SELECT * FROM payment_events WHERE order_id=?")
              .bind(o.id)
              .all()
          ).results,
          refund: await e.DB.prepare(
            "SELECT * FROM payment_refund_holds WHERE order_id=?",
          )
            .bind(o.id)
            .first(),
        };
      } else throw new Problem(404, "not_found");
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json(
      { error: err instanceof Problem ? err.code : "test_failed" },
      {
        status: err instanceof Problem ? err.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
