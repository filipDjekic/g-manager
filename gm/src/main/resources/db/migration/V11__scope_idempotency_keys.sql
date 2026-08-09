ALTER TABLE idempotency_keys ADD COLUMN principal_id CHAR(36) NULL;
ALTER TABLE idempotency_keys ADD COLUMN processing_token CHAR(36) NULL;
ALTER TABLE idempotency_keys ADD COLUMN lease_expires_at TIMESTAMP(6) NULL;

UPDATE idempotency_keys
SET principal_id = '00000000-0000-0000-0000-000000000000',
    processing_token = id,
    lease_expires_at = expires_at
WHERE principal_id IS NULL;

ALTER TABLE idempotency_keys DROP CONSTRAINT uk_idempotency_key_endpoint;
ALTER TABLE idempotency_keys
    ADD CONSTRAINT uk_idempotency_principal_key_endpoint
    UNIQUE (principal_id, idempotency_key, endpoint);

CREATE INDEX idx_idempotency_status_lease ON idempotency_keys (status, lease_expires_at);
