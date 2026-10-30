-- Additive staging-first schema. Existing R2 expiry and payment tables are unchanged.
CREATE TABLE IF NOT EXISTS drive_credentials (id INTEGER PRIMARY KEY CHECK(id=1), refresh_cipher TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS drive_oauth_states (state_hash TEXT PRIMARY KEY, verifier_cipher TEXT NOT NULL, actor TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS drive_nodes (node_key TEXT PRIMARY KEY, drive_id TEXT NOT NULL UNIQUE, ready INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS drive_projects (order_id TEXT PRIMARY KEY REFERENCES orders(id), folder_id TEXT, uploads_id TEXT, working_id TEXT, reports_id TEXT, finals_id TEXT, hold_reason TEXT, retention_at INTEGER, purged_at INTEGER);
CREATE TABLE IF NOT EXISTS drive_jobs (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), file_id TEXT NOT NULL REFERENCES order_files(id), transfer_type TEXT NOT NULL DEFAULT 'INPUT', state TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease_until INTEGER, lease_token TEXT, error_code TEXT, sha256 TEXT, verified_at INTEGER, UNIQUE(order_id,file_id,transfer_type));
CREATE INDEX IF NOT EXISTS drive_jobs_due ON drive_jobs(state,next_at,lease_until);
CREATE TABLE IF NOT EXISTS delivery_files (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), drive_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT, revision_id TEXT, state TEXT NOT NULL DEFAULT 'UPLOADING', scan_reference TEXT, approved_by TEXT, approved_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS delivery_files_order ON delivery_files(order_id,state);
CREATE TABLE IF NOT EXISTS deliveries (order_id TEXT PRIMARY KEY REFERENCES orders(id), status TEXT NOT NULL DEFAULT 'DRAFT', version INTEGER NOT NULL DEFAULT 0, published_at INTEGER, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS delivery_members (order_id TEXT NOT NULL REFERENCES deliveries(order_id), file_id TEXT NOT NULL REFERENCES delivery_files(id), sha256 TEXT NOT NULL, revision_id TEXT NOT NULL, PRIMARY KEY(order_id,file_id));
CREATE TABLE IF NOT EXISTS delivery_invites (token_hash TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES deliveries(order_id), version INTEGER NOT NULL, passcode_hash TEXT, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS delivery_sessions (token_hash TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES deliveries(order_id), version INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS delivery_sessions_expiry ON delivery_sessions(expires_at);
