import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import staging from "../src/staging";

test("staging configuration and routing isolate production and fail closed", async () => {
  const config = JSON.parse(
    readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8"),
  );
  const production = JSON.parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  assert.notEqual(config.name, production.name);
  assert.notEqual(
    config.d1_databases[0].database_id,
    production.d1_databases[0].database_id,
  );
  assert.notEqual(
    config.r2_buckets[0].bucket_name,
    production.r2_buckets[0].bucket_name,
  );
  assert.equal(config.vars.APP_ENV, "test");
  for (const key of ["PORTAL_ENABLED", "LEGAL_APPROVED", "INVOICE_CREATION"])
    assert.equal(config.vars[key], "false");
  assert.match(config.vars.ACCESS_AUD, /^[a-f0-9]{64}$/);
  assert.notEqual(config.vars.ACCESS_AUD, production.vars.ACCESS_AUD);
  assert.match(config.vars.TURNSTILE_SITE_KEY, /^0x/);
  assert.equal(config.vars.STRIPE_ACCOUNT_ID, "acct_1UVrQ3BxU4PsnoX0");
  assert.deepEqual(config.triggers.crons, ["*/15 * * * *"]);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(
    (
      await staging.fetch(
        new Request(
          config.vars.PUBLIC_SITE_ORIGIN +
            "/api/v1/admin/staging-validation/expire",
          { method: "POST" },
        ),
        { ...config.vars } as any,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await staging.fetch(
        new Request(
          config.vars.PUBLIC_SITE_ORIGIN +
            "/api/v1/admin/staging-validation/expire",
          { method: "POST" },
        ),
        { ...config.vars, STAGING_VALIDATION_ENABLED: "true" } as any,
      )
    ).status,
    401,
  );
  let assetCalls = 0;
  const env = {
    ...config.vars,
    ASSETS: {
      fetch: async () => {
        assetCalls++;
        return new Response("test shell");
      },
    },
  } as any;
  const request = (path: string) =>
    new Request(config.vars.PUBLIC_SITE_ORIGIN + path);
  const health = await staging.fetch(request("/health"), env);
  assert.equal(((await health.json()) as any).enabled, false);
  assert.equal(
    (await staging.fetch(request("/api/v1/admin/operations"), env)).status,
    401,
  );
  assert.equal(
    (
      await staging.fetch(
        new Request(config.vars.PUBLIC_SITE_ORIGIN + "/api/v1/orders", {
          method: "POST",
          headers: { Origin: config.vars.PUBLIC_SITE_ORIGIN },
        }),
        env,
      )
    ).status,
    503,
  );
  for (const route of [
    "/api/v1/admin/staging-readiness",
    "/api/v1/admin/staging-evidence/00000000-0000-0000-0000-000000000000",
  ]) {
    assert.equal((await staging.fetch(request(route), env)).status, 401);
  }
  assert.equal(assetCalls, 0);
  const shell = await staging.fetch(request("/project-portal/"), env);
  assert.equal(await shell.text(), "test shell");
  assert.equal(shell.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(
    (await staging.fetch(request("/"), { ...env, APP_ENV: "production" }))
      .status,
    503,
  );
});
