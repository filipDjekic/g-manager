-- Legacy long activation secrets cannot be converted to four-character codes.
-- Revoke them without deleting their existing history.
UPDATE customer_activation_tokens SET expires_at = CURRENT_TIMESTAMP(6)
WHERE consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP(6);

CREATE INDEX idx_customer_activation_consumed ON customer_activation_tokens (consumed_at);
CREATE INDEX idx_customer_activation_expired ON customer_activation_tokens (consumed_at, expires_at);

-- Shared by every backend instance. Permanent rows also provide transaction locks.
CREATE TABLE customer_activation_guards (
    guard_key VARCHAR(80) NOT NULL PRIMARY KEY,
    window_started_at TIMESTAMP(6) NOT NULL,
    attempts INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_customer_activation_guard_window ON customer_activation_guards (window_started_at);
INSERT INTO customer_activation_guards (guard_key, window_started_at, attempts)
VALUES ('global', CURRENT_TIMESTAMP(6), 0), ('generation', CURRENT_TIMESTAMP(6), 0);
