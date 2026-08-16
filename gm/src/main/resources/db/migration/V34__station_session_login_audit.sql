CREATE TABLE station_session_login_attempts (
    id CHAR(36) NOT NULL, identity_id CHAR(36) NOT NULL, station_id CHAR(36) NOT NULL,
    session_id CHAR(36) NULL, customer_id CHAR(36) NULL, identifier_hash CHAR(64) NOT NULL,
    outcome VARCHAR(30) NOT NULL, occurred_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_station_session_login_attempts PRIMARY KEY (id),
    CONSTRAINT fk_session_login_identity FOREIGN KEY (identity_id) REFERENCES station_machine_identities(id),
    CONSTRAINT fk_session_login_station FOREIGN KEY (station_id) REFERENCES physical_resources(id),
    CONSTRAINT fk_session_login_session FOREIGN KEY (session_id) REFERENCES gaming_sessions(id),
    CONSTRAINT fk_session_login_customer FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT chk_session_login_outcome CHECK (outcome IN ('SUCCESS','INVALID_CREDENTIALS','NO_ACTIVE_SESSION','LOGOUT'))
);
CREATE INDEX idx_session_login_station_time ON station_session_login_attempts (station_id,occurred_at);
CREATE INDEX idx_session_login_customer_time ON station_session_login_attempts (customer_id,occurred_at);
