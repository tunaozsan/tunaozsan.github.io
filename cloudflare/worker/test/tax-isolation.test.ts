import { test } from "node:test";
import assert from "node:assert/strict";
import { stagingTaxTools } from "../src/staging-tax-tools";
test("tax fixture mutations require exact isolated environment, bounded window and Access", async () => {
  const origin =
    "https://bluefin-project-portal-staging.bluefintuna-llc.workers.dev";
  const e: any = {
    APP_ENV: "test",
    ACCESS_ISSUER: "https://example.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    PUBLIC_SITE_ORIGIN: origin,
    STAGING_TAX_TEST_UNTIL: String(Math.floor(Date.now() / 1000) + 300),
  };
  const req = new Request(origin + "/api/v1/admin/tax-test/setup", {
    method: "POST",
    headers: { Origin: origin },
    body: "{}",
  });
  for (const override of [
    { APP_ENV: "production" },
    {
      PUBLIC_SITE_ORIGIN:
        "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev",
    },
    { STAGING_TAX_TEST_UNTIL: undefined },
    { STAGING_TAX_TEST_UNTIL: "1" },
    { STAGING_TAX_TEST_UNTIL: String(Math.floor(Date.now() / 1000) + 7200) },
  ])
    assert.equal(
      (await stagingTaxTools(req, { ...e, ...override })).status,
      404,
    );
  assert.equal(
    (await stagingTaxTools(req, { ...e, ADMIN_EMAILS: "operator@example.com" }))
      .status,
    401,
  );
});

test("production Checkout cannot silently fall back to manual or unconfigured tax", async () => {
  const { checkout } = await import("../src/payments");
  for (const TAX_MODE of ["unconfigured", "owner_reviewed_manual"])
    await assert.rejects(
      checkout({ APP_ENV: "production", TAX_MODE } as any, {} as any, {}, {}),
      (error: any) => error.code === "automatic_tax_required",
    );
});

test("missing or inclusive inherited tax defaults never become an implicit zero-tax override", async () => {
  const { checkTaxPrice } = await import("../src/tax");
  for (const defaults of [
    undefined,
    {},
    { tax_code: "txcd_20060048", tax_behavior: "inclusive" },
    { tax_code: "txcd_00000000", tax_behavior: "exclusive" },
  ])
    assert.throws(() =>
      checkTaxPrice(
        {
          currency: "usd",
          tax_behavior: "unspecified",
          product: { tax_code: null },
        },
        defaults,
      ),
    );
  assert.throws(() =>
    checkTaxPrice(
      {
        currency: "usd",
        tax_behavior: "inclusive",
        product: { tax_code: "txcd_20060048" },
      },
      { tax_code: "txcd_20060048", tax_behavior: "exclusive" },
    ),
  );
});
