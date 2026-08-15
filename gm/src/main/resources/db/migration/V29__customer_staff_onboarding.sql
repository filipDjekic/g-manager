ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE customer_activation_tokens (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    consumed_at TIMESTAMP(6) NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_customer_activation_tokens PRIMARY KEY (id),
    CONSTRAINT fk_customer_activation_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_customer_activation_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uk_customer_activation_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_customer_activation_user
    ON customer_activation_tokens (user_id, consumed_at, expires_at);
