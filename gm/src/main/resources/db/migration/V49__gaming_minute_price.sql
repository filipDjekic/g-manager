-- No default price: an OWNER/ADMIN must configure it before accepting payments.
ALTER TABLE gaming_business_policy ADD COLUMN minute_price DECIMAL(12,2) NULL;
ALTER TABLE gaming_business_policy ADD COLUMN time_price_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE gaming_business_policy ADD CONSTRAINT chk_minute_price CHECK (minute_price IS NULL OR minute_price>0);
ALTER TABLE gaming_financial_operations ADD COLUMN minute_price DECIMAL(12,2) NULL;
ALTER TABLE gaming_financial_operations ADD COLUMN price_version BIGINT NULL;
-- Historical rows retain their original amounts and need no synthetic price snapshot.
ALTER TABLE gaming_financial_operations ADD CONSTRAINT chk_priced_time_payment CHECK (
 (minute_price IS NULL AND price_version IS NULL) OR
 (kind='TIME_GRANT' AND minute_price IS NOT NULL AND minute_price>0 AND price_version IS NOT NULL AND price_version>=0
  AND granted_seconds>=1800 AND MOD(granted_seconds,60)=0 AND amount=minute_price*(granted_seconds/60))
);
