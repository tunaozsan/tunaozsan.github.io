-- Additive only. Apply remotely only after schema/backup review and explicit approval.
ALTER TABLE orders ADD COLUMN paid_total INTEGER;
ALTER TABLE orders ADD COLUMN paid_tax INTEGER;
ALTER TABLE orders ADD COLUMN stripe_invoice_id TEXT;
CREATE INDEX IF NOT EXISTS files_active ON order_files(state);
-- Two simultaneous bounded upload buffers across all orders. Fail closed until cleanup releases abandoned reservations.
CREATE TRIGGER IF NOT EXISTS global_upload_capacity BEFORE INSERT ON order_files
WHEN NEW.state='UPLOADING' BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM order_files WHERE state='UPLOADING')>=2 THEN RAISE(ABORT,'upload_capacity') END;
END;
