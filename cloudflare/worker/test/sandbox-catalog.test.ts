import { test } from "node:test";
import assert from "node:assert/strict";
import { sandboxCatalogTools } from "../src/sandbox-catalog-tools";
test("Sandbox mutation tools are unavailable in production and without a bounded window", async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const vars of [
    { APP_ENV: "production", SANDBOX_CATALOG_TEST_UNTIL: String(now + 60) },
    { APP_ENV: "test" },
    { APP_ENV: "test", SANDBOX_CATALOG_TEST_UNTIL: String(now - 1) },
    { APP_ENV: "test", SANDBOX_CATALOG_TEST_UNTIL: String(now + 7200) },
  ]) {
    const r = await sandboxCatalogTools(
      new Request(
        "https://staging.example/api/v1/admin/sandbox-catalog-test/provision",
        { method: "POST" },
      ),
      vars as any,
    );
    assert.equal(r.status, 404);
  }
});
