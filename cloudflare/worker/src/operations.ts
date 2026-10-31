import { type Env, type Deps } from "./security";

// Authenticated aggregate diagnostics only. Never include tokens, filenames or customer data.
export async function operations(e: Env, d: Deps) {
  const now = d.now();
  const heartbeat = await e.DB.prepare(
    "SELECT value FROM housekeeping WHERE key='cleanup_completed'",
  ).first<{ value: string }>();
  const cleanup = heartbeat ? JSON.parse(heartbeat.value) : null;
  const files = await e.DB.prepare(
    "SELECT COUNT(*) overdue, COALESCE(SUM(CASE WHEN retries>0 THEN 1 ELSE 0 END),0) retrying FROM order_files WHERE deleted_at IS NULL AND (expires_at<=? OR state='FAILED' OR (state='UPLOADING' AND created_at<?))",
  )
    .bind(now, now - 300)
    .first<any>();
  const notifications = await e.DB.prepare(
    "SELECT COUNT(*) pending, COALESCE(SUM(CASE WHEN attempts>=8 THEN 1 ELSE 0 END),0) exhausted, COALESCE(SUM(CASE WHEN next_at<? THEN 1 ELSE 0 END),0) overdue FROM notifications WHERE state!='SENT'",
  )
    .bind(now - 900)
    .first<any>();
  const retrieval = await e.DB.prepare(
    "SELECT COUNT(*) urgent FROM orders WHERE paid_at IS NOT NULL AND retrieved_at IS NULL AND expires_at>? AND expires_at<=?",
  )
    .bind(now, now + 3600)
    .first<any>();
  const telegramEnabled = !!(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID);
  const alerts = [];
  const paymentReviews =
    e.APP_ENV === "production"
      ? await e.DB.prepare(
          "SELECT COUNT(*) pending FROM payment_reviews WHERE state='OPEN'",
        ).first<{ pending: number }>()
      : null;
  if (paymentReviews?.pending) alerts.push("paid_sessions_require_review");
  if (!cleanup || now - cleanup.completedAt > 1800)
    alerts.push("cleanup_heartbeat_missing_or_stale");
  if (files.overdue || cleanup?.deleteFailures || cleanup?.orphanDeleteFailures)
    alerts.push("file_deletion_backlog");
  if (cleanup?.sessionFailures) alerts.push("checkout_expiration_retry");
  if (telegramEnabled && (notifications.exhausted || notifications.overdue))
    alerts.push("notification_delivery_delayed");
  if (retrieval.urgent) alerts.push("paid_files_need_retrieval");
  return {
    serverTime: now,
    status: alerts.length ? "attention" : "healthy",
    alerts,
    cleanup,
    files,
    notifications: { ...notifications, enabled: telegramEnabled },
    retrieval,
    paymentReviews,
  };
}
