import { type Env, type Deps } from "./security";
import { removeFile } from "./storage";
import { stripe } from "./payments";
export async function cleanup(e: Env, d: Deps) {
  const now = d.now();
  let deleteFailures = 0,
    orphanDeleteFailures = 0,
    sessionFailures = 0;
  const files = await e.DB.prepare(
    "SELECT * FROM order_files WHERE deleted_at IS NULL AND (expires_at<=? OR state='FAILED' OR (state='UPLOADING' AND created_at<?)) ORDER BY expires_at LIMIT 100",
  )
    .bind(now, now - 300)
    .all<any>();
  for (const f of files.results) {
    try {
      await removeFile(e, f, now);
    } catch {
      deleteFailures++;
      await e.DB.prepare("UPDATE order_files SET retries=retries+1 WHERE id=?")
        .bind(f.id)
        .run();
    }
  }
  await e.DB.prepare(
    "UPDATE orders SET status=CASE WHEN paid_at IS NOT NULL THEN 'PAID_FILES_EXPIRED' ELSE 'EXPIRED_UNPAID' END WHERE expires_at<=? AND status NOT IN ('NEEDS_REUPLOAD','PAID_FILES_EXPIRED','EXPIRED_UNPAID')",
  )
    .bind(now)
    .run();
  const orders = await e.DB.prepare(
    "SELECT id,stripe_session_id FROM orders WHERE expires_at<=? AND paid_at IS NULL AND stripe_session_id IS NOT NULL AND session_closed=0 ORDER BY expires_at DESC LIMIT 20",
  )
    .bind(now)
    .all<any>();
  if (e.STRIPE_SECRET_KEY)
    for (const o of orders.results) {
      try {
        const s = await stripe(
          e,
          d,
          "checkout/sessions/" + encodeURIComponent(o.stripe_session_id),
        );
        if (s.status === "open")
          await stripe(
            e,
            d,
            `checkout/sessions/${encodeURIComponent(o.stripe_session_id)}/expire`,
            new URLSearchParams(),
            `expire-${o.id}`,
          );
        await e.DB.prepare("UPDATE orders SET session_closed=1 WHERE id=?")
          .bind(o.id)
          .run();
      } catch {
        sessionFailures++;
        /* A late verified webhook remains authoritative. Retry next sweep. */
      }
    }
  // Sweep orphan/late-arriving objects too; cursor survives invocations, bounded per run.
  const cursor = await e.DB.prepare(
    "SELECT value FROM housekeeping WHERE key='r2_cursor'",
  ).first<{ value: string }>();
  const objects = await e.UPLOADS.list({
    prefix: "temp/",
    limit: 100,
    ...(cursor?.value ? { cursor: cursor.value } : {}),
  });
  for (const obj of objects.objects) {
    const f = await e.DB.prepare(
      "SELECT state,expires_at FROM order_files WHERE r2_key=?",
    )
      .bind(obj.key)
      .first<any>();
    if (
      (!f && obj.uploaded.getTime() < (now - 300) * 1000) ||
      (f && (f.expires_at <= now || ["FAILED", "DELETED"].includes(f.state)))
    ) {
      try {
        await e.UPLOADS.delete(obj.key);
      } catch {
        orphanDeleteFailures++;
        /* retained for next sweep */
      }
    }
  }
  await e.DB.prepare(
    "INSERT INTO housekeeping(key,value) VALUES ('r2_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  )
    .bind(objects.truncated ? objects.cursor : "")
    .run();
  await e.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?")
    .bind(now)
    .run();
  await notify(e, d);
  const summary = {
    completedAt: d.now(),
    scanned: files.results.length,
    deleteFailures,
    orphanDeleteFailures,
    sessionFailures,
  };
  await e.DB.prepare(
    "INSERT INTO housekeeping(key,value) VALUES ('cleanup_completed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  )
    .bind(JSON.stringify(summary))
    .run();
  return summary;
}
export async function notify(e: Env, d: Deps) {
  if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_CHAT_ID) return;
  const rows = await e.DB.prepare(
    "SELECT n.*,o.sku,o.subtotal,o.paid_total,o.expires_at FROM notifications n JOIN orders o ON n.order_id=o.id WHERE n.state!='SENT' AND n.next_at<=? AND (n.lease_until IS NULL OR n.lease_until<?) AND n.attempts<8 LIMIT 10",
  )
    .bind(d.now(), d.now())
    .all<any>();
  for (const n of rows.results) {
    const claim = await e.DB.prepare(
      "UPDATE notifications SET lease_until=?,attempts=attempts+1 WHERE order_id=? AND state!='SENT' AND (lease_until IS NULL OR lease_until<?)",
    )
      .bind(d.now() + 120, n.order_id, d.now())
      .run();
    if (!claim.meta.changes) continue;
    try {
      const r = await d.fetch(
        `https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: e.TELEGRAM_CHAT_ID,
            text: `Paid order ${n.order_id}\n${n.sku}\nUSD ${((n.paid_total ?? n.subtotal) / 100).toFixed(2)} ${n.paid_total === null ? "subtotal (legacy total unavailable)" : "verified paid total"}\nFiles inaccessible after ${new Date(n.expires_at * 1000).toISOString()}\nOpen the protected admin dashboard.`,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const result = (await r.json()) as any;
      if (!r.ok || !result.ok) throw Error();
      await e.DB.prepare(
        "UPDATE notifications SET state='SENT',sent_at=?,lease_until=NULL WHERE order_id=?",
      )
        .bind(d.now(), n.order_id)
        .run();
    } catch {
      await e.DB.prepare(
        "UPDATE notifications SET state='RETRY',next_at=?,lease_until=NULL WHERE order_id=?",
      )
        .bind(d.now() + Math.min(3600, 60 * 2 ** n.attempts), n.order_id)
        .run();
    }
  }
}
