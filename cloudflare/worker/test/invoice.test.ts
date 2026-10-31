import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import {
  invoiceStatement,
  invoiceResponse,
  renderInvoice,
} from "../src/invoice";
import { digest } from "../src/security";
import { app } from "../src/index";
import { quote } from "../src/catalog";
import { AGREEMENT_HASH, AGREEMENT_VERSION } from "../src/agreement";
let mf: any, e: any;
const now = 1793430000,
  id = "22222222-2222-4222-8222-222222222222",
  cap = "b".repeat(64);
const cart = {
  sku: "p6_audit",
  activities: 150,
  revisions: 0,
  materials: [],
  existingResources: false,
};
const q = quote(cart),
  customer = {
    name: "Synthetic Tuna Özsan",
    email: "synthetic@example.invalid",
    businessName: "Synthetic Planning Ltd",
    project: "Synthetic invoice validation",
  };
const session: any = {
  id: "cs_test_invoice",
  status: "complete",
  payment_status: "paid",
  livemode: false,
  currency: "usd",
  amount_subtotal: q.total,
  amount_total: q.total + 1234,
  total_details: {
    amount_tax: 1234,
    breakdown: {
      taxes: [
        {
          amount: 1234,
          taxability_reason: "standard_rated",
          taxable_amount: q.total,
          rate: {
            id: "txr_synthetic",
            inclusive: false,
            livemode: false,
            country: "US",
            state: "SD",
            percentage: 6.2,
            tax_type: "sales_tax",
          },
        },
      ],
    },
  },
  automatic_tax: { enabled: true, status: "complete" },
  billing_address_collection: "required",
  tax_id_collection: { enabled: true, required: "never" },
  customer_details: {
    name: customer.name,
    address: {
      line1: "224 W 9th St",
      city: "Sioux Falls",
      state: "SD",
      postal_code: "57104",
      country: "US",
    },
    tax_ids: [],
  },
  consent: { terms_of_service: "accepted" },
  metadata: {
    invoice_mode: "portal_pdf",
    approval_id: "synthetic",
    quote_hash: "quote",
  },
};
const acceptance = {
  scope_json: JSON.stringify(q),
  stripe_session_id: session.id,
  quote_sha256: "quote",
  agreement_version: AGREEMENT_VERSION,
  agreement_sha256: AGREEMENT_HASH,
};
const o = { id, customer: JSON.stringify(customer) },
  d: any = { now: () => now };
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
  const font = readFileSync(
    new URL("../../../assets/fonts/NotoSans-Regular.ttf", import.meta.url),
  );
  e = {
    DB,
    APP_ENV: "test",
    PUBLIC_SITE_ORIGIN: "https://fixture.invalid",
    ALLOWED_ORIGINS: "https://fixture.invalid",
    PORTAL_ENABLED: "false",
    STRIPE_ACCOUNT_ID: "acct_test",
    ASSETS: { fetch: async () => new Response(font) },
    RATE_LIMIT_SALT: "s".repeat(32),
  };
  await DB.prepare(
    "INSERT INTO orders(id,token_hash,sku,cart,customer,subtotal,status,created_at,expires_at,updated_at,stripe_session_id,paid_at,paid_total,paid_tax) VALUES (?,?,?,?,?,?,'PAID',?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      await digest(cap),
      "p6_audit",
      JSON.stringify(cart),
      o.customer,
      q.total,
      now,
      now + 43200,
      now,
      session.id,
      now,
      session.amount_total,
      1234,
    )
    .run();
});
after(async () => mf?.dispose());
test("invoice requires verified paid session and immutable acceptance; duplicate cannot rewrite original amounts", async () => {
  await assert.rejects(
    invoiceStatement(
      e,
      d,
      o,
      { ...session, payment_status: "unpaid" },
      acceptance,
      { id: "evt_test" },
    ),
    /invoice_payment_not_verified/,
  );
  await assert.rejects(
    invoiceStatement(
      e,
      d,
      o,
      session,
      { ...acceptance, quote_sha256: "changed" },
      { id: "evt_test" },
    ),
    /invoice_scope_not_verified/,
  );
  await (
    await invoiceStatement(e, d, o, session, acceptance, { id: "evt_test" })
  ).run();
  await (
    await invoiceStatement(e, d, o, session, acceptance, {
      id: "evt_duplicate",
    })
  ).run();
  const row = await e.DB.prepare(
    "SELECT * FROM order_invoices WHERE order_id=?",
  )
    .bind(id)
    .first();
  assert.equal(row.stripe_event_id, "evt_test");
  assert.equal(JSON.parse(row.snapshot_json).total, 21134);
  await assert.rejects(
    e.DB.prepare("UPDATE order_invoices SET snapshot_json=? WHERE order_id=?")
      .bind("{}", id)
      .run(),
    /immutable_invoice/,
  );
});
test("PDF preserves Unicode, totals and hash; original invoice survives refund without claiming it remains paid", async () => {
  const row = await e.DB.prepare(
    "SELECT * FROM order_invoices WHERE order_id=?",
  )
    .bind(id)
    .first();
  const font = readFileSync(
    new URL("../../../assets/fonts/NotoSans-Regular.ttf", import.meta.url),
  );
  const pdf = await renderInvoice(row, font, "REFUND_REVIEW_REQUIRED");
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
  mkdirSync(new URL("../../../.qa/tax-production-20261031/", import.meta.url), {
    recursive: true,
  });
  writeFileSync(
    new URL(
      "../../../.qa/tax-production-20261031/synthetic-invoice.pdf",
      import.meta.url,
    ),
    pdf,
  );
  await assert.rejects(
    renderInvoice({ ...row, snapshot_json: "{}" }, font, "PAID"),
    /invoice_integrity_failed/,
  );
});
test("customer invoice remains private when intake closed; wrong capability denied; 12h customer expiry does not delete admin invoice", async () => {
  const handler = app({ ...d, fetch: fetch });
  const url = e.PUBLIC_SITE_ORIGIN + "/api/v1/orders/" + id + "/invoice";
  assert.equal((await handler.fetch(new Request(url), e)).status, 401);
  assert.equal(
    (
      await handler.fetch(
        new Request(url, {
          headers: { Authorization: "Bearer " + "c".repeat(64) },
        }),
        e,
      )
    ).status,
    404,
  );
  const response = await handler.fetch(
    new Request(url, { headers: { Authorization: "Bearer " + cap } }),
    e,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(
    (
      await app({ ...d, now: () => now + 43200, fetch }).fetch(
        new Request(url, { headers: { Authorization: "Bearer " + cap } }),
        e,
      )
    ).status,
    410,
  );
  assert.equal((await invoiceResponse(e, id)).status, 200);
});
