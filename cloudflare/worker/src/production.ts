import {
  approvalRoute,
  approvalForOrder,
  approvedIntakeReady,
  type ApprovalEnv,
} from "./order-approval";
import { digest, equal } from "./security";
import { app } from "./index";
import { deliveryRoute, deliveryMaintenance } from "./delivery";
import { type DriveEnv } from "./drive";
import {
  applications,
  applicationsReady,
  applicationCleanup,
  type ApplicationEnv,
} from "./applications";
import { defaults, type Deps } from "./security";
import { Problem } from "./catalog";
import { AGREEMENT_HASH, AGREEMENT_VERSION } from "./agreement";
import { liveReadiness } from "./live-readiness";
import { setupLiveWebhook, type LiveSetupEnv } from "./live-webhook-setup";
import { liveMaintenance } from "./live-maintenance";
type ProductionEnv = ApprovalEnv &
  ApplicationEnv &
  LiveSetupEnv &
  DriveEnv & { ASSETS: Fetcher };
// Deliberately no staging tooling or synthetic-payment overrides in this build.
// File intake and Checkout remain closed until real merchant/tax/Drive prerequisites pass.
export function production(d: Deps = defaults) {
  const portal = app(d);
  return {
    async fetch(req: Request, e: ProductionEnv): Promise<Response> {
      if (e.APP_ENV !== "production")
        return new Response("Production configuration required", {
          status: 503,
        });
      const path = new URL(req.url).pathname;
      let response: Response;
      try {
        if (
          req.headers.get("origin") &&
          req.headers.get("origin") !== e.PUBLIC_SITE_ORIGIN
        )
          throw new Problem(403, "origin_denied");
        if (path === "/health")
          response = Response.json({
            service: "bluefin-project-portal",
            mode: "production",
            enabled: false,
            applicationsEnabled: applicationsReady(e),
            checkoutEnabled: false,
            filesEnabled: false,
            reviewedOrdersEnabled: approvedIntakeReady(e),
            unavailableSkus: (e.UNAVAILABLE_SKUS || "")
              .split(",")
              .filter(Boolean),
            termsVersion: AGREEMENT_VERSION,
            termsHash: AGREEMENT_HASH,
          });
        else if (path === "/api/v1/admin/stripe-readiness")
          response = await liveReadiness(req, e, d);
        else if (path === "/api/v1/admin/stripe-webhook-setup")
          response = await setupLiveWebhook(req, e, d);
        else if (path === "/api/v1/admin/stripe-maintenance")
          response = await liveMaintenance(req, e, d);
        else if (
          path === "/api/v1/applications" ||
          path === "/api/v1/admin/applications"
        )
          response = await applications(req, e, d);
        else if (
          path === "/api/v1/approved-orders/redeem" ||
          /^\/api\/v1\/admin\/applications\/[a-f0-9-]{36}\/(approve|revoke)$/.test(
            path,
          )
        )
          response = await approvalRoute(req, e, d);
        else if (/^\/api\/v1\/orders\/[a-f0-9-]{36}\//.test(path)) {
          if (!["GET", "HEAD"].includes(req.method) && !approvedIntakeReady(e))
            throw new Problem(503, "approved_intake_closed");
          const oid = path.split("/")[4];
          const cap = req.headers
            .get("authorization")
            ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
          if (!cap) throw new Problem(401, "order_access_required");
          const o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
            .bind(oid)
            .first<any>();
          if (!o || !equal(o.token_hash, await digest(cap)))
            throw new Problem(404, "order_not_found");
          if (!["GET", "HEAD"].includes(req.method))
            await approvalForOrder(e, d, o);
          response = await portal.fetch(req, { ...e, PORTAL_ENABLED: "true" });
        } else if (path.includes("/staging-") || path.includes("/sandbox-"))
          throw new Problem(404, "not_found");
        else if (
          path.startsWith("/api/v1/delivery/") ||
          path.startsWith("/api/v1/admin/drive/") ||
          /^\/api\/v1\/admin\/orders\/[a-f0-9-]{36}\/delivery(?:\/|$)/.test(
            path,
          )
        )
          response = await deliveryRoute(req, e, d);
        else if (path === "/api/v1/admin")
          response = Response.redirect(
            e.PUBLIC_SITE_ORIGIN + "/api/v1/admin/applications",
            302,
          );
        else if (path.startsWith("/api/"))
          response = await portal.fetch(req, { ...e, PORTAL_ENABLED: "false" });
        else if (path === "/")
          response = Response.redirect(
            e.PUBLIC_SITE_ORIGIN + "/project-portal/",
            302,
          );
        else {
          const assetURL = new URL(req.url);
          if (assetURL.pathname === "/support")
            assetURL.pathname = "/support/index.html";
          else if (assetURL.pathname.endsWith("/"))
            assetURL.pathname += "index.html";
          response = await e.ASSETS.fetch(new Request(assetURL, req));
        }
      } catch (error) {
        response = Response.json(
          { error: error instanceof Problem ? error.code : "request_failed" },
          { status: error instanceof Problem ? error.status : 500 },
        );
      }
      const result = new Response(response.body, response);
      result.headers.set("Cache-Control", "no-store");
      result.headers.set("X-Content-Type-Options", "nosniff");
      result.headers.set("Referrer-Policy", "no-referrer");
      result.headers.set("Strict-Transport-Security", "max-age=31536000");
      result.headers.set(
        "Content-Security-Policy",
        path.startsWith("/api/")
          ? "default-src 'none'; frame-ancestors 'none'"
          : "frame-ancestors 'none'",
      );
      result.headers.set("X-Robots-Tag", "noindex, nofollow");
      return result;
    },
    async scheduled(
      event: ScheduledController,
      e: ProductionEnv,
      ctx: ExecutionContext,
    ) {
      if (e.APP_ENV !== "production")
        throw Error("Production configuration required");
      await portal.scheduled(event, e, ctx);
      ctx.waitUntil(applicationCleanup(e, d));
      ctx.waitUntil(deliveryMaintenance(e, d));
    },
  };
}
export default production();
