-- Provider-confirmed payments without valid portal scope/consent remain financial facts.
-- This queue never creates an order, backdates acceptance, or authorizes fulfillment.
CREATE TABLE IF NOT EXISTS payment_reviews (
 event_id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL,
 payment_intent_id TEXT,
 claimed_order_id TEXT,
 reason TEXT NOT NULL,
 amount_total INTEGER NOT NULL CHECK(amount_total >= 0),
 currency TEXT NOT NULL,
 payment_status TEXT NOT NULL CHECK(payment_status = 'paid'),
 stripe_event_created_at INTEGER,
 recorded_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','RESOLVED'))
);
CREATE INDEX IF NOT EXISTS payment_review_open ON payment_reviews(state,recorded_at);
