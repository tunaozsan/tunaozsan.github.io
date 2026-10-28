PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, sku TEXT NOT NULL, cart TEXT NOT NULL,
 customer TEXT NOT NULL, subtotal INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'usd',
 status TEXT NOT NULL DEFAULT 'DRAFT', created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL, paid_at INTEGER, stripe_session_id TEXT UNIQUE, checkout_url TEXT, session_closed INTEGER NOT NULL DEFAULT 0,
 consent_version TEXT, consent_at INTEGER, quote_hash TEXT, quote_until INTEGER,
 parent_id TEXT REFERENCES orders(id), retrieved_at INTEGER,
 CHECK(expires_at=created_at+43200), CHECK(subtotal>=0)
);
CREATE INDEX IF NOT EXISTS orders_expiry ON orders(expires_at,status);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
CREATE TABLE IF NOT EXISTS order_files (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), r2_key TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL, mime TEXT NOT NULL, category TEXT NOT NULL, bytes INTEGER NOT NULL,
 state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 deleted_at INTEGER, retries INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS files_expiry ON order_files(expires_at,deleted_at);
CREATE INDEX IF NOT EXISTS files_order ON order_files(order_id,state);
CREATE TRIGGER IF NOT EXISTS reserve_file BEFORE INSERT ON order_files BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM orders WHERE id=NEW.order_id AND status='DRAFT' AND expires_at>NEW.created_at) THEN RAISE(ABORT,'order_locked') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM order_files WHERE order_id=NEW.order_id AND state IN ('UPLOADING','READY'))>=20 THEN RAISE(ABORT,'file_quota') END;
 SELECT CASE WHEN (SELECT COALESCE(SUM(bytes),0) FROM order_files WHERE order_id=NEW.order_id AND state IN ('UPLOADING','READY'))+NEW.bytes>104857600 THEN RAISE(ABORT,'byte_quota') END;
END;
CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY,event_type TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id),created_at INTEGER NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (order_id TEXT PRIMARY KEY REFERENCES orders(id),state TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,lease_until INTEGER,sent_at INTEGER);
CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT,actor TEXT NOT NULL,action TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS housekeeping (key TEXT PRIMARY KEY,value TEXT NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS one_reupload_per_parent ON orders(parent_id) WHERE parent_id IS NOT NULL;
