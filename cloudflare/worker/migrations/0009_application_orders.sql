-- Additive approval/invitation evidence. Existing applications, payments and consent are unchanged.
CREATE TABLE IF NOT EXISTS application_approvals (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE REFERENCES service_applications(id),
 order_id TEXT NOT NULL UNIQUE, invite_hash TEXT NOT NULL UNIQUE,
 scope_sha256 TEXT NOT NULL, quote_sha256 TEXT NOT NULL, customer_sha256 TEXT NOT NULL,
 terms_version TEXT NOT NULL, terms_sha256 TEXT NOT NULL,
 basis_reference TEXT NOT NULL, basis_sha256 TEXT NOT NULL, decision_json TEXT NOT NULL,
 approved_by TEXT NOT NULL, approved_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 redeemed_at INTEGER, revoked_at INTEGER, invalid_reason TEXT
);
CREATE TRIGGER IF NOT EXISTS application_approval_immutable BEFORE UPDATE ON application_approvals
WHEN NEW.application_id!=OLD.application_id OR NEW.order_id!=OLD.order_id OR NEW.invite_hash!=OLD.invite_hash
 OR NEW.scope_sha256!=OLD.scope_sha256 OR NEW.quote_sha256!=OLD.quote_sha256 OR NEW.customer_sha256!=OLD.customer_sha256
 OR NEW.terms_version!=OLD.terms_version OR NEW.terms_sha256!=OLD.terms_sha256
 OR NEW.basis_reference!=OLD.basis_reference OR NEW.basis_sha256!=OLD.basis_sha256 OR NEW.decision_json!=OLD.decision_json
 OR NEW.approved_by!=OLD.approved_by OR NEW.approved_at!=OLD.approved_at OR NEW.expires_at!=OLD.expires_at
BEGIN SELECT RAISE(ABORT,'immutable_application_approval'); END;
CREATE INDEX IF NOT EXISTS approval_validity ON application_approvals(expires_at,revoked_at);
