import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import {
  approvalRoute,
  approvalForOrder,
  captureReviewed,
  billingAddress,
  orderQuoteHash,
} from "../src/order-approval";
import { digest } from "../src/security";
import { seal } from "../src/drive";
import { quote } from "../src/catalog";
import { AGREEMENT_VERSION, AGREEMENT_HASH } from "../src/agreement";
let mf: any,
  e: any,
  d: any,
  jwt: string,
  now = 1800000000;
const origin = "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev";
const appId = "11111111-1111-4111-8111-111111111111";
const cart = {
  sku: "p6_audit",
  activities: 150,
  revisions: 0,
  materials: [],
  existingResources: false,
};
const customer = {
  name: "Synthetic",
  email: "synthetic@example.invalid",
  project: "Synthetic review",
  dataDate: "",
  businessUse: true,
  businessName: "Synthetic Ltd",
  billingCountry: "US",
  billingState: "SD",
  billingAddress: "224 W 9th St",
  billingCity: "Sioux Falls",
  billingPostal: "57104",
  projectCountry: "US",
};
const body = {
  basisReference: "synthetic tax basis only",
  basisHash: "a".repeat(64),
  kind: "documented_no_collection",
  reasonCodes: ["standard_rated"],
  scopeReviewed: true,
};
const req = (path: string, b: any) =>
  new Request(origin + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Cf-Access-Jwt-Assertion": jwt,
    },
    body: JSON.stringify(b),
  });
before(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: "2026-10-28",
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
  });
  const DB = await mf.getD1Database("DB");
  for (const f of readdirSync(new URL("../migrations", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await DB.exec(
      readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8")
        .replace(/^--.*$/gm, "")
        .replace(/\n/g, " "),
    );
  e = {
    DB,
    UPLOADS: await mf.getR2Bucket("UPLOADS"),
    APP_ENV: "production",
    PUBLIC_SITE_ORIGIN: origin,
    ALLOWED_ORIGINS: origin,
    LEGAL_APPROVED: "true",
    PORTAL_ENABLED: "false",
    APPROVED_ORDERS_ENABLED: "true",
    TAX_MODE: "automatic",
    INVOICE_CREATION: "true",
    REVIEWED_INVOICE_MODE: "portal_pdf",
    STRIPE_ACCOUNT_ID: "acct_1UV444BzdKYgwVw6",
    STRIPE_SECRET_KEY: "sk_live_" + "fixtureOnly123",
    STRIPE_WEBHOOK_SECRET: "whsec_fixtureOnly",
    ACCESS_ISSUER: "https://fixture.cloudflareaccess.com",
    ACCESS_AUD: "fixture",
    ADMIN_EMAILS: "admin@example.invalid",
    TURNSTILE_SECRET_KEY: "fixture",
    RATE_LIMIT_SALT: "s".repeat(48),
    DRIVE_ENABLED: "true",
    GOOGLE_CLIENT_ID: "fixture",
    GOOGLE_CLIENT_SECRET: "fixture",
    DRIVE_TOKEN_KEY: btoa("a".repeat(32)),
  };
  const pair = await generateKeyPair("RS256"),
    jwk = await exportJWK(pair.publicKey);
  jwk.kid = "fixture";
  jwt = await new SignJWT({ email: e.ADMIN_EMAILS })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .setIssuer(e.ACCESS_ISSUER)
    .setAudience(e.ACCESS_AUD)
    .setExpirationTime("1h")
    .sign(pair.privateKey);
  d = {
    now: () => now,
    adminKeys: createLocalJWKSet({ keys: [jwk] }),
    fetch: async (u: string) => {
      if (u.includes("oauth2.googleapis"))
        return Response.json({
          access_token: "fixture-never-output",
          expires_in: 3600,
        });
      if (u.includes("generateIds"))
        return Response.json({ ids: ["private-fixture"] });
      return Response.json({
        id: "private-fixture",
        ownedByMe: true,
        shared: false,
        trashed: false,
        mimeType: "application/vnd.google-apps.folder",
      });
    },
  };
});
after(async () => mf?.dispose());
beforeEach(async () => {
  await e.DB.exec(
    "DELETE FROM application_approvals; DELETE FROM service_applications; DELETE FROM orders; DELETE FROM rate_limits; DELETE FROM drive_nodes; DELETE FROM drive_credentials;",
  );
  await e.DB.prepare(
    "INSERT INTO drive_credentials(id,refresh_cipher,status,updated_at) VALUES (1,?,'CONNECTED',?)",
  )
    .bind(await seal(e, "synthetic-refresh", "drive-refresh"), now)
    .run();
  const scope = JSON.stringify(quote(cart));
  await e.DB.prepare(
    "INSERT INTO service_applications(id,customer_json,scope_json,quote_sha256,terms_version,terms_sha256,accepted_at,created_at,expires_at,status,review_reasons_json) VALUES (?,?,?,?,?,?,?,?,?,'PAYMENT_SETUP_PENDING','[]')",
  )
    .bind(
      appId,
      JSON.stringify(customer),
      scope,
      await digest(scope),
      AGREEMENT_VERSION,
      AGREEMENT_HASH,
      now,
      now,
      now + 30 * 86400,
    )
    .run();
});
async function approved() {
  return (await (
    await approvalRoute(
      req("/api/v1/admin/applications/" + appId + "/approve", body),
      e,
      d,
    )
  ).json()) as any;
}
async function redeemed() {
  const a = await approved(),
    invitation = new URL(a.invitationUrl).hash.slice("#approved=".length);
  const r = (await (
    await approvalRoute(
      req("/api/v1/approved-orders/redeem", { invitation }),
      e,
      d,
    )
  ).json()) as any;
  const o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(r.orderId)
    .first<any>();
  o.quote_hash = await orderQuoteHash(cart);
  return { a, r, o, invitation, approval: await approvalForOrder(e, d, o) };
}
test("explicit documented review, single-use invitation and fresh 12h order; application consent is not payment consent", async () => {
  await assert.rejects(
    approvalRoute(
      req("/api/v1/admin/applications/" + appId + "/approve", {
        ...body,
        basisReference: "",
      }),
      e,
      d,
    ),
    /documented_tax_basis_required/,
  );
  const { r, invitation } = await redeemed();
  assert.equal(r.expiresAt, now + 43200);
  assert.equal(r.approvedApplication, true);
  await assert.rejects(
    approvalRoute(req("/api/v1/approved-orders/redeem", { invitation }), e, d),
    /invitation_unavailable/,
  );
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT COUNT(*) n FROM agreement_acceptances",
      ).first<any>()
    ).n,
    0,
  );
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT COUNT(*) n FROM drive_nodes WHERE node_key='production-root'",
      ).first<any>()
    ).n,
    1,
  );
});
test("old portal flag alone never opens invitation intake; missing Drive fails before creating order", async () => {
  const a = await approved(),
    invitation = new URL(a.invitationUrl).hash.slice(10);
  await assert.rejects(
    approvalRoute(
      req("/api/v1/approved-orders/redeem", { invitation }),
      { ...e, PORTAL_ENABLED: "true", APPROVED_ORDERS_ENABLED: "false" },
      d,
    ),
    /approved_intake_closed/,
  );
  await e.DB.exec("DELETE FROM drive_credentials");
  await assert.rejects(
    approvalRoute(req("/api/v1/approved-orders/redeem", { invitation }), e, d),
    /drive_reauthorization_required/,
  );
  assert.equal(
    (await e.DB.prepare("SELECT COUNT(*) n FROM orders").first<any>()).n,
    0,
  );
});
test("scope, billing facts and agreement approval are immutable and cannot migrate to another order", async () => {
  const { o } = await redeemed();
  await assert.rejects(
    approvalForOrder(e, d, {
      ...o,
      customer: JSON.stringify({ ...customer, billingState: "OR" }),
    }),
    /approval_scope_or_address_changed/,
  );
  await assert.rejects(
    approvalForOrder(e, d, {
      ...o,
      cart: JSON.stringify({ ...cart, revisions: 1 }),
    }),
  );
  await assert.rejects(
    approvalForOrder(e, d, { ...o, id: crypto.randomUUID() }),
    /approved_application_required/,
  );
  await assert.rejects(
    e.DB.exec("UPDATE application_approvals SET basis_reference='changed'"),
    /immutable_application_approval/,
  );
});
for (const scenario of [
  "match",
  "address",
  "tax-reason",
  "revoked",
  "capture-error",
] as const)
  test("reviewed authorization " + scenario, async () => {
    const { o, approval } = await redeemed();
    const s: any = {
      id: "cs_fixture",
      livemode: true,
      client_reference_id: o.id,
      metadata: { quote_hash: o.quote_hash },
      status: "complete",
      payment_status: "unpaid",
      payment_intent: "pi_fixture",
      currency: "usd",
      amount_subtotal: 19900,
      amount_total: 21134,
      automatic_tax: { enabled: true, status: "complete" },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true, required: "never" },
      consent: { terms_of_service: "accepted" },
      customer_details: { address: billingAddress(customer) },
      total_details: {
        amount_tax: 1234,
        breakdown: {
          taxes: [
            {
              amount: 1234,
              taxability_reason: "standard_rated",
              rate: { inclusive: false, livemode: true },
            },
          ],
        },
      },
    };
    if (scenario === "address") s.customer_details.address.state = "OR";
    if (scenario === "tax-reason")
      s.total_details.breakdown.taxes[0].taxability_reason = "not_collecting";
    if (scenario === "revoked")
      await e.DB.prepare("UPDATE application_approvals SET revoked_at=?")
        .bind(now)
        .run();
    let captured = 0,
      cancelled = 0;
    const dep = {
      ...d,
      fetch: async (url: string) => {
        if (url.endsWith("/capture")) {
          captured++;
          if (scenario === "capture-error")
            return new Response("provider failed", { status: 503 });
          return Response.json({ status: "succeeded" });
        }
        if (url.endsWith("/cancel")) {
          cancelled++;
          return Response.json({ status: "canceled", amount_received: 0 });
        }
        if (url.includes("/checkout/sessions/"))
          return Response.json({ ...s, payment_status: "paid" });
        return Response.json({
          id: "pi_fixture",
          livemode: true,
          currency: "usd",
          amount: s.amount_total,
          metadata: { order_id: o.id },
          capture_method: "manual",
          status: "requires_capture",
          amount_capturable: s.amount_total,
        });
      },
    };
    if (scenario === "match") {
      assert.equal(
        (await captureReviewed(e, dep, o, s, approval)).payment_status,
        "paid",
      );
      assert.equal(captured, 1);
      assert.equal(cancelled, 0);
    } else {
      await assert.rejects(captureReviewed(e, dep, o, s, approval));
      assert.equal(cancelled, scenario === "capture-error" ? 0 : 1);
      assert.equal(captured, scenario === "capture-error" ? 1 : 0);
      assert.equal(
        (
          await e.DB.prepare("SELECT paid_at FROM orders WHERE id=?")
            .bind(o.id)
            .first<any>()
        ).paid_at,
        null,
      );
    }
  });

test("rejected address webhook acknowledges a verified release once, preserving the first reason and no PAID/invoice", async () => {
  const { o, approval } = await redeemed();
  const s: any = {
    id: "cs_live_synthetic",
    livemode: true,
    client_reference_id: o.id,
    metadata: {
      order_id: o.id,
      quote_hash: o.quote_hash,
      agreement_version: AGREEMENT_VERSION,
      agreement_sha256: AGREEMENT_HASH,
      approval_id: approval.id,
      customer_sha256: approval.customer_sha256,
      invoice_mode: "portal_pdf",
    },
    status: "complete",
    payment_status: "unpaid",
    payment_intent: "pi_fixture",
    currency: "usd",
    amount_subtotal: 19900,
    amount_total: 21134,
    automatic_tax: { enabled: true, status: "complete" },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true, required: "never" },
    consent_collection: { terms_of_service: "required" },
    consent: { terms_of_service: "accepted" },
    customer_details: {
      address: { ...billingAddress(customer), line1: "CHANGED" },
    },
    total_details: {
      amount_tax: 1234,
      breakdown: {
        taxes: [
          {
            amount: 1234,
            taxability_reason: "standard_rated",
            rate: { inclusive: false, livemode: true },
          },
        ],
      },
    },
  };
  await e.DB.prepare(
    "UPDATE orders SET stripe_session_id=?,quote_hash=?,consent_at=?,consent_version=? WHERE id=?",
  )
    .bind(s.id, o.quote_hash, now, AGREEMENT_VERSION, o.id)
    .run();
  await e.DB.prepare(
    "INSERT INTO agreement_acceptances(order_id,agreement_version,agreement_sha256,agreement_status,documents_url,scope_json,quote_sha256,portal_accepted_at,stripe_session_id) VALUES (?,?,?,'APPROVED','https://fixture.invalid/terms',?,?,?,?)",
  )
    .bind(
      o.id,
      AGREEMENT_VERSION,
      AGREEMENT_HASH,
      JSON.stringify(quote(cart)),
      o.quote_hash,
      now,
      s.id,
    )
    .run();
  await e.DB.prepare(
    "INSERT INTO checkout_tax_requirements(order_id,stripe_session_id,quote_sha256,mode,tax_code,tax_behavior,created_at) VALUES (?,?,?,'automatic','txcd_20060048','exclusive',?)",
  )
    .bind(o.id, s.id, o.quote_hash, now)
    .run();
  let cancels = 0;
  const dep = {
    ...d,
    fetch: async (u: string) => {
      if (u.includes("/checkout/sessions/")) return Response.json(s);
      if (u.endsWith("/cancel")) {
        cancels++;
        return Response.json({ status: "canceled", amount_received: 0 });
      }
      return Response.json({
        id: "pi_fixture",
        livemode: true,
        currency: "usd",
        amount: 21134,
        metadata: { order_id: o.id },
        capture_method: "manual",
        status: "requires_capture",
        amount_capturable: 21134,
        amount_received: 0,
      });
    },
  };
  const event = {
      id: "evt_release",
      type: "checkout.session.completed",
      livemode: true,
      data: { object: s },
    },
    raw = JSON.stringify(event);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(e.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(now + "." + raw),
    ),
  ).toString("hex");
  const request = () =>
    new Request(origin + "/api/v1/stripe/webhook", {
      method: "POST",
      headers: { "Stripe-Signature": `t=${now},v1=${sig}` },
      body: raw,
    });
  const { webhook } = await import("../src/payments");
  assert.deepEqual(await webhook(request(), e, dep), {
    received: true,
    reviewRequired: true,
    charged: false,
  });
  assert.equal((await webhook(request(), e, dep)).duplicate, true);
  assert.equal(cancels, 1);
  assert.equal(
    (
      await e.DB.prepare(
        "SELECT invalid_reason FROM application_approvals WHERE order_id=?",
      )
        .bind(o.id)
        .first()
    ).invalid_reason,
    "checkout_address_changed",
  );
  assert.equal(
    (
      await e.DB.prepare("SELECT paid_at FROM orders WHERE id=?")
        .bind(o.id)
        .first()
    ).paid_at,
    null,
  );
  assert.equal(
    (await e.DB.prepare("SELECT count(*) n FROM order_invoices").first()).n,
    0,
  );
});
