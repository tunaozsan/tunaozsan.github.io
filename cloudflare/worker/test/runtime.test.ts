import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildSync } from "esbuild";
import { Miniflare } from "miniflare";
import { digest } from "../src/security";
import { MAX_FILE, TTL } from "../src/catalog";

test("real local Workers runtime bounds two concurrent 20 MiB uploads and rejects a third", async () => {
  const script = buildSync({
    entryPoints: [new URL("../src/index.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  }).outputFiles[0].text;
  const site = "https://bluefintuna.life";
  const mf = new Miniflare({
    modules: true,
    script,
    compatibilityDate: "2026-10-28",
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
    bindings: {
      APP_ENV: "test",
      PORTAL_ENABLED: "true",
      LEGAL_APPROVED: "true",
      PUBLIC_SITE_ORIGIN: site,
      ALLOWED_ORIGINS: site,
      ACCESS_ISSUER: "https://example.cloudflareaccess.com",
      ACCESS_AUD: "aud",
      ADMIN_EMAILS: "operator@example.com",
      STRIPE_ACCOUNT_ID: "acct_test",
      STRIPE_SECRET_KEY: "sk_test_FAKE00000000",
      STRIPE_WEBHOOK_SECRET: "whsec_FAKE00000000",
      TURNSTILE_SECRET_KEY: "fake",
      RATE_LIMIT_SALT: "x".repeat(32),
      TAX_MODE: "owner_reviewed_manual",
      INVOICE_CREATION: "false",
    },
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const pending: Promise<Response>[] = [];
  try {
    const db = await mf.getD1Database("DB");
    for (const name of readdirSync(new URL("../migrations/", import.meta.url))
      .filter((x) => x.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")
          .replace(/^--.*$/gm, "")
          .replace(/\n/g, " "),
      );
    const now = Math.floor(Date.now() / 1000),
      token = "a".repeat(64),
      orders = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const id of orders)
      await db
        .prepare(
          "INSERT INTO orders(id,token_hash,sku,cart,customer,subtotal,status,created_at,expires_at,updated_at) VALUES (?,?,'p6_audit','{}','{}',19900,'DRAFT',?,?,?)",
        )
        .bind(id, await digest(token), now, now + TTL, now)
        .run();
    const upload = (i: number, body: any) =>
      mf.dispatchFetch(`https://api.example/api/v1/orders/${orders[i]}/files`, {
        method: "POST",
        headers: {
          origin: site,
          authorization: "Bearer " + token,
          "content-type": "text/plain",
          "x-file-name": "synthetic.xer",
          "x-file-category": "xer",
        },
        body,
        duplex: "half",
      } as any) as Promise<Response>;
    const stream = () => {
      let sent = 0;
      return new ReadableStream<Uint8Array>({
        async pull(c) {
          if (sent === 0) {
            c.enqueue(new TextEncoder().encode("ERMHDR"));
            sent = 6;
            return;
          }
          await gate;
          if (sent === MAX_FILE) {
            c.close();
            return;
          }
          const chunk = new Uint8Array(Math.min(1024 * 1024, MAX_FILE - sent));
          chunk.fill(65);
          sent += chunk.length;
          c.enqueue(chunk);
        },
      });
    };
    pending.push(upload(0, stream()), upload(1, stream()));
    const deadline = Date.now() + 5000;
    let active = 0;
    while (Date.now() < deadline) {
      active = (await db
        .prepare("SELECT COUNT(*) n FROM order_files WHERE state='UPLOADING'")
        .first<any>())!.n;
      if (active === 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(active, 2);
    assert.equal((await upload(2, "ERMHDR fixture")).status, 409);
    release();
    for (const r of await Promise.all(pending))
      assert.equal(r.status, 201, await r.clone().text());
    const totals = await db
      .prepare(
        "SELECT COUNT(*) n,SUM(bytes) bytes FROM order_files WHERE state='READY'",
      )
      .first<any>();
    assert.equal(totals.n, 2);
    assert.equal(totals.bytes, 2 * MAX_FILE);
  } finally {
    release();
    await Promise.allSettled(pending);
    await mf.dispose();
  }
});
