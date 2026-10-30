-- Additive: keep original payment/consent history and retention deadlines unchanged.
CREATE TABLE IF NOT EXISTS payment_refund_holds (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), charge_id TEXT NOT NULL,
 amount_refunded INTEGER NOT NULL CHECK(amount_refunded>0), currency TEXT NOT NULL,
 first_seen_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_refund_events (
 event_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 charge_id TEXT NOT NULL, amount_refunded INTEGER NOT NULL, observed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_refund_checks (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), checked_at INTEGER NOT NULL
);
