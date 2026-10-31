-- Additive invoice evidence for reviewed/manual-capture orders only.
-- Existing Stripe invoices and historical financial/consent records are untouched.
CREATE TABLE IF NOT EXISTS order_invoices (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 stripe_session_id TEXT NOT NULL UNIQUE,
 stripe_event_id TEXT NOT NULL,
 issued_at INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL,
 snapshot_sha256 TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS order_invoice_immutable
BEFORE UPDATE ON order_invoices BEGIN
 SELECT RAISE(ABORT,'immutable_invoice_evidence');
END;
