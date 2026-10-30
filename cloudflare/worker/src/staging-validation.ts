import { admin, defaults, digest, type Env } from "./security";
import { stripe } from "./payments";
import { Problem } from "./catalog";

// Temporary, explicitly gated staging-only diagnostics. No key or Checkout URL leaves this route.
const ACCOUNT = "acct_1UVrQ3BxU4PsnoX0";
const PAID = "966850e0-bace-4638-9440-b14524e5ce6f";
const FIXTURE = "45f0be70-dc6b-4488-a380-b3ca25fd06a1";
const EVENT = "evt_1UVuDSBxU4PsnoX0EyRp43va";
const ENDPOINT = "we_1UVsLABxU4PsnoX0A0jmGtLe";
export async function validation(
  req: Request,
  e: Env & { STAGING_VALIDATION_ENABLED?: string },
) {
  if (e.APP_ENV !== "test" || e.STAGING_VALIDATION_ENABLED !== "true")
    return new Response("Not found", { status: 404 });
  try {
    await admin(req, e);
    if (req.method !== "POST") throw new Problem(405, "method_not_allowed");
    if (req.headers.get("Origin") !== e.PUBLIC_SITE_ORIGIN)
      throw new Problem(403, "origin_denied");
    if (
      e.STRIPE_ACCOUNT_ID !== ACCOUNT ||
      !e.STRIPE_SECRET_KEY?.startsWith("sk_test_")
    )
      throw new Problem(503, "sandbox_required");
    const account = await stripe(e, defaults, "account");
    if (account.id !== ACCOUNT) throw new Problem(503, "sandbox_mismatch");
    const action = new URL(req.url).pathname.split("/").pop();
    let result: unknown;
    if (action === "resend") {
      const endpoint = await stripe(
        e,
        defaults,
        "webhook_endpoints/" + ENDPOINT,
      );
      const event = await stripe(e, defaults, "events/" + EVENT);
      if (
        endpoint.livemode !== false ||
        endpoint.url !== e.PUBLIC_SITE_ORIGIN + "/api/v1/stripe/webhook" ||
        event.livemode !== false ||
        event.data?.object?.metadata?.order_id !== PAID
      )
        throw new Problem(400, "fixture_mismatch");
      const retried = await stripe(
        e,
        defaults,
        "events/" + EVENT + "/retry",
        new URLSearchParams({ webhook_endpoint: ENDPOINT }),
      );
      result = {
        requested: true,
        eventId: EVENT,
        returnedId: retried.id,
        pendingWebhooks: retried.pending_webhooks,
      };
    } else if (action === "expire") {
      const now = defaults.now();
      const hash = await digest("staging-expiry-fixture-2026-10-30");
      await e.DB.prepare(
        "INSERT OR IGNORE INTO orders(id,token_hash,sku,cart,customer,subtotal,status,created_at,expires_at,updated_at,quote_hash) VALUES (?,?,'p6_audit',?, ?,19900,'AWAITING_PAYMENT',?,?,?,?)",
      )
        .bind(
          FIXTURE,
          await digest(crypto.randomUUID()),
          JSON.stringify({
            sku: "p6_audit",
            activities: 150,
            revisions: 0,
            materials: [],
            existingResources: false,
          }),
          JSON.stringify({
            name: "Staging Expiry Fixture",
            email: "staging-tests@example.com",
            project: "STAGING EXPIRY",
          }),
          now,
          now + 43200,
          now,
          hash,
        )
        .run();
      const row = await e.DB.prepare(
        "SELECT stripe_session_id,expires_at FROM orders WHERE id=?",
      )
        .bind(FIXTURE)
        .first<any>();
      let session;
      if (row.stripe_session_id)
        session = await stripe(
          e,
          defaults,
          "checkout/sessions/" + row.stripe_session_id,
        );
      else {
        session = await stripe(
          e,
          defaults,
          "checkout/sessions",
          new URLSearchParams({
            mode: "payment",
            client_reference_id: FIXTURE,
            "metadata[order_id]": FIXTURE,
            "metadata[quote_hash]": hash,
            "payment_method_types[0]": "card",
            success_url: e.PUBLIC_SITE_ORIGIN + "/payment/success/",
            cancel_url: e.PUBLIC_SITE_ORIGIN + "/payment/cancel/",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][unit_amount]": "19900",
            "line_items[0][price_data][product_data][name]":
              "STAGING expiry fixture - do not pay",
            "line_items[0][quantity]": "1",
            expires_at: String(row.expires_at),
          }),
          "staging-expiry-fixture-2026-10-30",
        );
        if (
          session.livemode !== false ||
          session.metadata?.order_id !== FIXTURE
        )
          throw new Problem(400, "fixture_mismatch");
        await e.DB.prepare(
          "UPDATE orders SET stripe_session_id=? WHERE id=? AND stripe_session_id IS NULL",
        )
          .bind(session.id, FIXTURE)
          .run();
      }
      if (session.livemode !== false)
        throw new Problem(400, "test_session_required");
      if (session.status === "open")
        session = await stripe(
          e,
          defaults,
          "checkout/sessions/" + session.id + "/expire",
          new URLSearchParams(),
        );
      result = {
        orderId: FIXTURE,
        sessionId: session.id,
        status: session.status,
        livemode: session.livemode,
      };
    } else if (action === "evidence") {
      const orders = await e.DB.prepare(
        "SELECT id,status,paid_total,paid_tax,paid_at,stripe_invoice_id FROM orders WHERE id IN (?,?)",
      )
        .bind(PAID, FIXTURE)
        .all();
      const events = await e.DB.prepare(
        "SELECT id,event_type,order_id,status FROM payment_events WHERE order_id IN (?,?)",
      )
        .bind(PAID, FIXTURE)
        .all();
      const expired = await stripe(
        e,
        defaults,
        "events?type=checkout.session.expired&limit=100",
      );
      const paid = await e.DB.prepare(
        "SELECT stripe_session_id FROM orders WHERE id=?",
      )
        .bind(PAID)
        .first<any>();
      const session = await stripe(
        e,
        defaults,
        "checkout/sessions/" + paid.stripe_session_id,
      );
      const intent = await stripe(
        e,
        defaults,
        "payment_intents/" + session.payment_intent,
      );
      const charge = await stripe(
        e,
        defaults,
        "charges/" + intent.latest_charge,
      );
      const balance = charge.balance_transaction
        ? await stripe(
            e,
            defaults,
            "balance_transactions/" + charge.balance_transaction,
          )
        : null;
      if (
        session.livemode !== false ||
        intent.livemode !== false ||
        charge.livemode !== false
      )
        throw new Problem(400, "test_payment_required");
      result = {
        completedEvent: {
          id: EVENT,
          pendingWebhooks: (await stripe(e, defaults, "events/" + EVENT))
            .pending_webhooks,
        },
        orders: orders.results,
        events: events.results,
        stripeExpiredEvents: expired.data
          .filter((x: any) => x.data?.object?.metadata?.order_id === FIXTURE)
          .map((x: any) => ({
            id: x.id,
            type: x.type,
            api_version: x.api_version,
            livemode: x.livemode,
            pending_webhooks: x.pending_webhooks,
          })),
        payment: {
          amount: charge.amount,
          currency: charge.currency,
          paid: charge.paid,
          captured: charge.captured,
          receiptAvailable: !!charge.receipt_url,
          billingCountry: charge.billing_details?.address?.country,
          method: charge.payment_method_details?.type,
          balance: balance
            ? {
                amount: balance.amount,
                fee: balance.fee,
                net: balance.net,
                currency: balance.currency,
                status: balance.status,
              }
            : null,
        },
      };
    } else throw new Problem(404, "not_found");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Problem ? error.code : "staging_validation_failed",
      },
      {
        status: error instanceof Problem ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
