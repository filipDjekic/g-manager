ALTER TABLE gaming_sessions
 ADD COLUMN billing_mode VARCHAR(30) NOT NULL DEFAULT 'FIXED_DURATION',
 ADD COLUMN metered_tariff_id CHAR(36) NULL,
 ADD COLUMN metered_price DECIMAL(14,2) NULL,
 ADD COLUMN metered_tariff_seconds BIGINT NULL,
 ADD COLUMN billing_unit_seconds INT NULL,
 ADD COLUMN billed_seconds BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN charged_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN last_billed_at TIMESTAMP(6) NULL,
 ADD COLUMN metered_lease_until TIMESTAMP(6) NULL,
 ADD CONSTRAINT chk_metered_session CHECK (billing_mode IN ('FIXED_DURATION','PREPAID_METERED') AND charged_amount>=0 AND billed_seconds>=0 AND (billing_mode='FIXED_DURATION' OR (customer_id IS NOT NULL AND metered_tariff_id IS NOT NULL AND metered_price IS NOT NULL AND metered_tariff_seconds IS NOT NULL AND billing_unit_seconds IS NOT NULL AND metered_lease_until IS NOT NULL AND metered_price>0 AND metered_tariff_seconds>0 AND billing_unit_seconds>0)));
ALTER TABLE gaming_business_policy
 ADD COLUMN allow_fixed BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN allow_metered BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN default_mode VARCHAR(30) NOT NULL DEFAULT 'FIXED_DURATION',
 ADD COLUMN billing_unit_seconds INT NOT NULL DEFAULT 1;
ALTER TABLE gaming_charges ADD COLUMN billed_seconds BIGINT NULL;
CREATE UNIQUE INDEX uk_metered_charge_interval ON gaming_charges(session_id,billed_seconds);
ALTER TABLE gaming_charges DROP CONSTRAINT chk_charge;
ALTER TABLE gaming_charges ADD CONSTRAINT chk_charge CHECK (amount>=0 AND recognized_amount>=0 AND currency='RSD' AND ((billed_seconds IS NULL AND minutes>0) OR (billed_seconds>0 AND minutes=0)));
ALTER TABLE gaming_business_policy ADD CONSTRAINT chk_metered_policy CHECK (billing_unit_seconds BETWEEN 1 AND 3600 AND (allow_fixed OR allow_metered) AND ((default_mode='FIXED_DURATION' AND allow_fixed) OR (default_mode='PREPAID_METERED' AND allow_metered)));
