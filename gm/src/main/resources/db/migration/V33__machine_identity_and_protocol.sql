CREATE TABLE station_enrollment_tokens (
    id CHAR(36) NOT NULL, station_id CHAR(36) NOT NULL, token_hash CHAR(64) NOT NULL,
    purpose VARCHAR(20) NOT NULL, status VARCHAR(20) NOT NULL, expires_at TIMESTAMP(6) NOT NULL,
    consumed_at TIMESTAMP(6) NULL, created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_station_enrollment_tokens PRIMARY KEY (id),
    CONSTRAINT fk_enrollment_station FOREIGN KEY (station_id) REFERENCES physical_resources(id),
    CONSTRAINT fk_enrollment_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uk_enrollment_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_enrollment_purpose CHECK (purpose IN ('INITIAL','ROTATION')),
    CONSTRAINT chk_enrollment_status CHECK (status IN ('ACTIVE','CONSUMED','REVOKED'))
);
CREATE INDEX idx_enrollment_station_status_expiry ON station_enrollment_tokens (station_id,status,expires_at);

CREATE TABLE station_machine_identities (
    id CHAR(36) NOT NULL, station_id CHAR(36) NOT NULL, public_key_base64 TEXT NOT NULL,
    public_key_fingerprint CHAR(64) NOT NULL, key_version BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL, enrolled_at TIMESTAMP(6) NOT NULL, enrolled_by CHAR(36) NOT NULL,
    overlap_expires_at TIMESTAMP(6) NULL, revoked_at TIMESTAMP(6) NULL,
    last_authenticated_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_station_machine_identities PRIMARY KEY (id),
    CONSTRAINT fk_machine_identity_station FOREIGN KEY (station_id) REFERENCES physical_resources(id),
    CONSTRAINT fk_machine_identity_enroller FOREIGN KEY (enrolled_by) REFERENCES users(id),
    CONSTRAINT uk_machine_station_key_version UNIQUE (station_id,key_version),
    CONSTRAINT uk_machine_public_fingerprint UNIQUE (public_key_fingerprint),
    CONSTRAINT chk_machine_identity_status CHECK (status IN ('ACTIVE','ROTATING','REVOKED')),
    CONSTRAINT chk_machine_key_version CHECK (key_version > 0)
);
CREATE INDEX idx_machine_identity_station_status ON station_machine_identities (station_id,status,key_version);

CREATE TABLE station_auth_challenges (
    id CHAR(36) NOT NULL, identity_id CHAR(36) NOT NULL, nonce_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL, consumed_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_station_auth_challenges PRIMARY KEY (id),
    CONSTRAINT fk_machine_challenge_identity FOREIGN KEY (identity_id) REFERENCES station_machine_identities(id),
    CONSTRAINT uk_machine_challenge_nonce UNIQUE (nonce_hash)
);
CREATE INDEX idx_machine_challenge_identity_expiry ON station_auth_challenges (identity_id,expires_at,consumed_at);

CREATE TABLE station_heartbeats (
    station_id CHAR(36) NOT NULL, identity_id CHAR(36) NOT NULL,
    client_version VARCHAR(60) NOT NULL, client_status VARCHAR(30) NOT NULL,
    last_command_sequence BIGINT NOT NULL DEFAULT 0, last_seen_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_station_heartbeats PRIMARY KEY (station_id),
    CONSTRAINT fk_station_heartbeat_station FOREIGN KEY (station_id) REFERENCES physical_resources(id),
    CONSTRAINT fk_station_heartbeat_identity FOREIGN KEY (identity_id) REFERENCES station_machine_identities(id),
    CONSTRAINT chk_heartbeat_cursor CHECK (last_command_sequence >= 0)
);
CREATE INDEX idx_station_heartbeat_identity ON station_heartbeats (identity_id,last_seen_at);
CREATE INDEX idx_station_heartbeat_last_seen ON station_heartbeats (last_seen_at);
