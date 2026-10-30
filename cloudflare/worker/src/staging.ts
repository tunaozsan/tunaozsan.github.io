import { sandboxCatalogTools } from "./sandbox-catalog-tools";
import { deliveryRoute, deliveryMaintenance } from "./delivery";
import { driveEnabled, type DriveEnv } from "./drive";
import { validation } from "./staging-validation";
import portal from "./index";
import { admin, defaults, jsonBody, type Env } from "./security";
import { stripe } from "./payments";
import { Problem } from "./catalog";

type StagingEnv = DriveEnv & {
  ASSETS: Fetcher;
  SANDBOX_CATALOG_TEST_UNTIL?: string;
  STAGING_REUPLOAD_TEST_ORDER?: string;
  STAGING_REUPLOAD_TEST_UNTIL?: string;
  STAGING_CONSENT_TEST_UNTIL?: string;
};

export default {
  async fetch(req: Request, env: StagingEnv): Promise<Response> {
    if (env.APP_ENV !== "test")
      return new Response("Staging only", { status: 503 });
    if (
      Number(env.STAGING_CONSENT_TEST_UNTIL) > defaults.now() &&
      Number(env.STAGING_CONSENT_TEST_UNTIL) <= defaults.now() + 900
    ) {
      env = {
        ...env,
        PORTAL_ENABLED: "true",
        LEGAL_APPROVED: "true",
        TAX_MODE: "owner_reviewed_manual",
      };
    }
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/v1/admin/sandbox-catalog-test/"))
      return sandboxCatalogTools(req, env);
    if (path.startsWith("/api/v1/admin/staging-validation/"))
      return validation(req, env);
    if (
      path.startsWith("/api/v1/delivery/") ||
      path.startsWith("/api/v1/admin/drive/") ||
      /^\/api\/v1\/admin\/orders\/[a-f0-9-]{36}\/delivery(?:\/|$)/.test(path)
    )
      return deliveryRoute(req, env);
    // Controlled capability-protected re-upload test window. New customer intake stays closed.
    if (
      Number(env.STAGING_REUPLOAD_TEST_UNTIL) > defaults.now() &&
      Number(env.STAGING_REUPLOAD_TEST_UNTIL) <= defaults.now() + 900 &&
      env.STAGING_REUPLOAD_TEST_ORDER &&
      /^[a-f0-9-]{36}$/.test(env.STAGING_REUPLOAD_TEST_ORDER) &&
      new RegExp(
        "^/api/v1/orders/" +
          env.STAGING_REUPLOAD_TEST_ORDER +
          "/(files|quote|status)$",
      ).test(path)
    ) {
      return portal.fetch(req, {
        ...env,
        PORTAL_ENABLED: "true",
        LEGAL_APPROVED: "true",
        TAX_MODE: "owner_reviewed_manual",
      });
    }
    let response: Response;
    const evidence = path.match(
      /^\/api\/v1\/admin\/staging-evidence\/([a-f0-9-]{36})$/,
    );
    if (evidence && req.method === "GET") {
      try {
        await admin(req, env);
        if (!/^sk_test_/.test(env.STRIPE_SECRET_KEY || ""))
          throw new Problem(503, "test_stripe_key_required");
        const order = await env.DB.prepare(
          "SELECT stripe_session_id,status,paid_total,paid_tax FROM orders WHERE id=?",
        )
          .bind(evidence[1])
          .first<{
            stripe_session_id: string;
            status: string;
            paid_total: number;
            paid_tax: number;
          }>();
        if (!order?.stripe_session_id)
          throw new Problem(404, "test_session_missing");
        const session = await stripe(
          env,
          defaults,
          "checkout/sessions/" + encodeURIComponent(order.stripe_session_id),
        );
        if (
          session.livemode !== false ||
          session.metadata?.order_id !== evidence[1]
        )
          throw new Problem(400, "test_session_mismatch");
        const invoice =
          typeof session.invoice === "string"
            ? await stripe(
                env,
                defaults,
                "invoices/" + encodeURIComponent(session.invoice),
              )
            : null;
        if (invoice?.livemode === true)
          throw new Problem(400, "test_invoice_required");
        if (new URL(req.url).searchParams.get("format") === "pdf") {
          if (!invoice?.invoice_pdf)
            throw new Problem(404, "invoice_not_ready");
          const pdfUrl = new URL(invoice.invoice_pdf);
          if (
            pdfUrl.protocol !== "https:" ||
            !pdfUrl.hostname.endsWith(".stripe.com")
          )
            throw new Problem(502, "invalid_invoice_host");
          const pdf = await fetch(pdfUrl, {
            signal: AbortSignal.timeout(15000),
          });
          if (!pdf.ok) throw new Problem(502, "invoice_download_failed");
          return new Response(pdf.body, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": "attachment; filename=sandbox-invoice.pdf",
              "Cache-Control": "no-store",
            },
          });
        }
        const endpoints = await stripe(
          env,
          defaults,
          "webhook_endpoints?limit=100",
        );
        const events = await stripe(
          env,
          defaults,
          "events?type=checkout.session.completed&limit=100",
        );
        const processed = await env.DB.prepare(
          "SELECT id,event_type,status FROM payment_events WHERE order_id=?",
        )
          .bind(evidence[1])
          .all();
        return Response.json(
          {
            order,
            session: {
              id: session.id,
              livemode: session.livemode,
              status: session.status,
              payment_status: session.payment_status,
              currency: session.currency,
              amount_total: session.amount_total,
              invoice: session.invoice,
            },
            invoice: invoice
              ? {
                  id: invoice.id,
                  status: invoice.status,
                  paid: invoice.paid,
                  total: invoice.total,
                  currency: invoice.currency,
                  customer_name: invoice.customer_name,
                  customer_address: invoice.customer_address,
                  pdfAvailable: !!invoice.invoice_pdf,
                }
              : null,
            processed: processed.results,
            endpoints: endpoints.data
              .filter(
                (x: any) =>
                  x.url === env.PUBLIC_SITE_ORIGIN + "/api/v1/stripe/webhook",
              )
              .map((x: any) => ({
                id: x.id,
                api_version: x.api_version,
                status: x.status,
                livemode: x.livemode,
                enabled_events: x.enabled_events,
              })),
            events: events.data
              .filter((x: any) => x.data?.object?.id === session.id)
              .map((x: any) => ({
                id: x.id,
                api_version: x.api_version,
                type: x.type,
                livemode: x.livemode,
              })),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Problem ? error.code : "staging_evidence_failed",
          },
          {
            status: error instanceof Problem ? error.status : 502,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    }
    if (path === "/api/v1/admin/staging-readiness") {
      try {
        await admin(req, env);
        if (req.method === "GET") {
          if (!/^sk_test_/.test(env.STRIPE_SECRET_KEY || ""))
            throw new Problem(503, "test_stripe_key_required");
          const account = await stripe(env, defaults, "account");
          return Response.json(
            {
              mode: env.APP_ENV,
              configuredAccount: env.STRIPE_ACCOUNT_ID,
              sandboxAccountMatches: account.id === env.STRIPE_ACCOUNT_ID,
              restVersion: "2025-02-24.acacia",
              intakeEnabled: env.PORTAL_ENABLED === "true",
              turnstileConfigured: !!env.TURNSTILE_SECRET_KEY,
              saltConfigured: (env.RATE_LIMIT_SALT?.length || 0) >= 32,
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        if (req.method === "POST") {
          if (req.headers.get("Origin") !== env.PUBLIC_SITE_ORIGIN)
            throw new Problem(403, "origin_denied");
          const body = (await jsonBody(req)) as { token?: unknown };
          if (typeof body.token !== "string" || body.token.length > 2048)
            throw new Problem(400, "challenge_required");
          const result = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
              method: "POST",
              body: new URLSearchParams({
                secret: env.TURNSTILE_SECRET_KEY || "",
                response: body.token,
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
          const challenge = (await result.json()) as {
            success?: boolean;
            hostname?: string;
            action?: string;
          };
          const valid =
            challenge.success === true &&
            challenge.hostname === new URL(env.PUBLIC_SITE_ORIGIN).hostname &&
            challenge.action === "create-order";
          return Response.json(
            { valid, hostname: challenge.hostname, action: challenge.action },
            {
              status: valid ? 200 : 403,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
        throw new Problem(405, "method_not_allowed");
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Problem ? error.message : "staging_check_failed",
          },
          {
            status: error instanceof Problem ? error.status : 502,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    }
    if (path === "/health" || path.startsWith("/api/")) {
      response = await portal.fetch(req, env);
      // Cron reconciles paid files into durable D1 jobs. Webhook acknowledgement
      // never depends on Drive availability or queue insertion.
    } else if (path === "/") {
      response = Response.redirect(
        new URL("/project-portal/", req.url).href,
        302,
      );
    } else {
      response = await env.ASSETS.fetch(req);
    }
    const result = new Response(response.body, response);
    result.headers.set("X-Robots-Tag", "noindex, nofollow");
    result.headers.set("Cache-Control", "no-store");
    return result;
  },
  async scheduled(
    event: ScheduledController,
    env: StagingEnv,
    ctx: ExecutionContext,
  ) {
    if (env.APP_ENV !== "test") throw new Error("Staging only");
    await portal.scheduled(event, env, ctx);
    if (driveEnabled(env)) ctx.waitUntil(deliveryMaintenance(env));
  },
};
