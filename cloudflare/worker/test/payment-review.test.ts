import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { webhook } from "../src/payments";
import { operations } from "../src/operations";
let mf: Miniflare,
  e: any,
  session: any,
  fetches = 0;
const now = 1800000000;
const d: any = {
  now: () => now,
  fetch: async (url: string) => {
    fetches++;
    return Response.json(
      url.endsWith("/account") ? { id: "acct_livefixture" } : session,
    );
  },
};
before(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}',
    d1Databases: ["DB"],
  });
  const DB = await mf.getD1Database("DB");
  for (const f of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await DB.exec(
      readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8")
        .replace(/^--.*$/gm, "")
        .replace(/\n/g, " "),
    );
  e = {
    DB,
    APP_ENV: "production",
    STRIPE_SECRET_KEY: "rk_live_SYNTHETICONLY",
    STRIPE_WEBHOOK_SECRET: "whsec_SYNTHETICONLY",
    STRIPE_ACCOUNT_ID: "acct_livefixture",
  };
});
after(async () => {
  await mf.dispose();
});
beforeEach(async () => {
  await e.DB.prepare("DELETE FROM payment_reviews").run();
  fetches = 0;
  session = {
    id: "cs_live_fixture",
    livemode: true,
    payment_status: "paid",
    status: "complete",
    amount_total: 19900,
    currency: "usd",
    metadata: {},
    payment_intent: "pi_fixture",
    customer_details: { email: "must-not-be-recorded@example.test" },
  };
});
async function request(extra: any = {}, signed = true) {
  const event = {
    id: "evt_fixture",
    type: "checkout.session.completed",
    livemode: true,
    created: now - 1,
    data: { object: { id: session.id, metadata: {} } },
    ...extra,
  };
  const body = JSON.stringify(event),
    key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(e.STRIPE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  const sig = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(now + "." + body),
      ),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  return new Request("https://production.example/api/v1/stripe/webhook", {
    method: "POST",
    body,
    headers: signed ? { "stripe-signature": `t=${now},v1=${sig}` } : {},
  });
}
async function count(table: string) {
  return (await e.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;
}
test("verified unbound Live payment is retained once without inventing D1 consent or fulfillment", async () => {
  for (let i = 0; i < 2; i++)
    await assert.rejects(webhook(await request(), e, d), /unknown_order/);
  assert.equal(await count("payment_reviews"), 1);
  const row = await e.DB.prepare("SELECT * FROM payment_reviews").first();
  assert.equal(row.amount_total, 19900);
  assert.equal(row.reason, "unknown_order");
  assert.equal(row.payment_status, "paid");
  assert.doesNotMatch(
    JSON.stringify(row),
    /must-not-be-recorded|whsec|rk_live/,
  );
  for (const table of [
    "orders",
    "agreement_acceptances",
    "drive_jobs",
    "notifications",
  ])
    assert.equal(await count(table), 0);
  const monitor = await operations(e, d);
  assert.equal(monitor.paymentReviews?.pending, 1);
  assert.ok(monitor.alerts.includes("paid_sessions_require_review"));
});
test("invalid signatures, wrong account, unpaid and provider mode mismatch never create financial review facts", async () => {
  await assert.rejects(
    webhook(await request({}, false), e, d),
    /invalid_signature/,
  );
  await assert.rejects(
    webhook(await request({ account: "acct_wrong" }), e, d),
    /wrong_account/,
  );
  assert.equal(fetches, 0);
  session.payment_status = "unpaid";
  await assert.rejects(webhook(await request(), e, d), /unknown_order/);
  session.payment_status = "paid";
  session.livemode = false;
  await assert.rejects(webhook(await request(), e, d), /unknown_order/);
  assert.equal(await count("payment_reviews"), 0);
});
test("unbound claimed order remains blocked and records only the server verified session", async () => {
  session.metadata = { order_id: "11111111-1111-4111-8111-111111111111" };
  const payload = {
    data: { object: { id: session.id, metadata: session.metadata } },
  };
  await assert.rejects(
    webhook(await request(payload), e, d),
    /session_not_bound/,
  );
  const row = await e.DB.prepare("SELECT * FROM payment_reviews").first();
  assert.equal(row.claimed_order_id, session.metadata.order_id);
  assert.equal(row.state, "OPEN");
  assert.equal(await count("orders"), 0);
});
