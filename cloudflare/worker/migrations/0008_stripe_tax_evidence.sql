-- Additive: legacy payments/acceptances are not backfilled or reclassified.
CREATE TABLE IF NOT EXISTS checkout_tax_requirements (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 stripe_session_id TEXT UNIQUE,
 quote_sha256 TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode='automatic'),
 tax_code TEXT NOT NULL,
 tax_behavior TEXT NOT NULL CHECK(tax_behavior='exclusive'),
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_tax_evidence (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 stripe_session_id TEXT NOT NULL UNIQUE,
 stripe_event_id TEXT NOT NULL,
 stripe_account_id TEXT NOT NULL,
 rest_version TEXT NOT NULL,
 verified_at INTEGER NOT NULL,
 currency TEXT NOT NULL CHECK(currency='usd'),
 subtotal INTEGER NOT NULL CHECK(subtotal>=0),
 tax INTEGER NOT NULL CHECK(tax>=0),
 total INTEGER NOT NULL CHECK(total=subtotal+tax),
 tax_status TEXT NOT NULL CHECK(tax_status='complete'),
 tax_code TEXT NOT NULL,
 tax_behavior TEXT NOT NULL CHECK(tax_behavior='exclusive'),
 billing_country TEXT NOT NULL,
 billing_state TEXT,
 breakdown_json TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS payment_tax_evidence_immutable
BEFORE UPDATE ON payment_tax_evidence BEGIN
 SELECT RAISE(ABORT,'immutable_tax_evidence');
END;
