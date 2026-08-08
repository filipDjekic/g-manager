ALTER TABLE refresh_tokens ADD COLUMN session_id CHAR(36) NULL;
ALTER TABLE refresh_tokens ADD COLUMN device_label VARCHAR(100) NULL;
ALTER TABLE refresh_tokens ADD COLUMN user_agent_summary VARCHAR(160) NULL;
ALTER TABLE refresh_tokens ADD COLUMN ip_hash VARCHAR(64) NULL;
ALTER TABLE refresh_tokens ADD COLUMN last_seen_at TIMESTAMP(6) NULL;

UPDATE refresh_tokens
SET session_id = id,
    device_label = 'Unknown device',
    user_agent_summary = 'Unknown client',
    ip_hash = REPEAT('0', 64),
    last_seen_at = created_at
WHERE session_id IS NULL;

CREATE INDEX idx_refresh_tokens_user_last_seen ON refresh_tokens (user_id, last_seen_at);
CREATE INDEX idx_refresh_tokens_session ON refresh_tokens (session_id);

CREATE TABLE security_events (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NULL,
    session_id CHAR(36) NULL,
    event_type VARCHAR(40) NOT NULL,
    device_label VARCHAR(100) NOT NULL,
    ip_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_security_events PRIMARY KEY (id),
    CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_security_events_user_created ON security_events (user_id, created_at);
CREATE INDEX idx_security_events_created ON security_events (created_at);
