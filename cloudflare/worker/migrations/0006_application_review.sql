-- Applications are not paid orders. Never manufacture Stripe or historical consent.
CREATE TABLE IF NOT EXISTS service_applications (
 id TEXT PRIMARY KEY, customer_json TEXT NOT NULL, scope_json TEXT NOT NULL,
 quote_sha256 TEXT NOT NULL, terms_version TEXT NOT NULL, terms_sha256 TEXT NOT NULL,
 accepted_at INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'TAX_REVIEW_REQUIRED', review_reasons_json TEXT NOT NULL,
 hold_reason TEXT, hold_review_at INTEGER
);
CREATE TRIGGER IF NOT EXISTS application_acceptance_immutable BEFORE UPDATE ON service_applications
WHEN NEW.customer_json != OLD.customer_json OR NEW.scope_json != OLD.scope_json OR NEW.quote_sha256 != OLD.quote_sha256 OR NEW.terms_version != OLD.terms_version OR NEW.terms_sha256 != OLD.terms_sha256 OR NEW.accepted_at != OLD.accepted_at
BEGIN SELECT RAISE(ABORT,'application_acceptance_immutable'); END;
CREATE INDEX IF NOT EXISTS application_expiry ON service_applications(expires_at);
