-- Additive evidence only. Never backfill or invent acceptance for historical orders.
CREATE TABLE IF NOT EXISTS agreement_acceptances (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 agreement_version TEXT NOT NULL, agreement_sha256 TEXT NOT NULL,
 agreement_status TEXT NOT NULL CHECK(agreement_status IN ('DRAFT','APPROVED')),
 documents_url TEXT NOT NULL, scope_json TEXT NOT NULL, quote_sha256 TEXT NOT NULL,
 portal_accepted_at INTEGER NOT NULL,
 stripe_session_id TEXT UNIQUE,
 stripe_terms_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(stripe_terms_status IN ('PENDING','ACCEPTED')),
 stripe_verified_at INTEGER, stripe_event_id TEXT, stripe_event_created_at INTEGER
);
CREATE TRIGGER IF NOT EXISTS acceptance_immutable BEFORE UPDATE ON agreement_acceptances
WHEN NEW.order_id != OLD.order_id OR NEW.agreement_version != OLD.agreement_version OR NEW.agreement_sha256 != OLD.agreement_sha256 OR NEW.agreement_status != OLD.agreement_status OR NEW.documents_url != OLD.documents_url OR NEW.scope_json != OLD.scope_json OR NEW.quote_sha256 != OLD.quote_sha256 OR NEW.portal_accepted_at != OLD.portal_accepted_at OR (OLD.stripe_session_id IS NOT NULL AND NEW.stripe_session_id IS NOT OLD.stripe_session_id) OR (OLD.stripe_terms_status='ACCEPTED' AND (NEW.stripe_terms_status!='ACCEPTED' OR NEW.stripe_verified_at IS NOT OLD.stripe_verified_at OR NEW.stripe_event_id IS NOT OLD.stripe_event_id))
BEGIN SELECT RAISE(ABORT,'acceptance_immutable'); END;
