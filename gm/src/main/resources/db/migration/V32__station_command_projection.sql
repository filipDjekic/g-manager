ALTER TABLE gaming_sessions
    ADD COLUMN last_command_sequence BIGINT NULL;

CREATE TABLE station_command_sequences (
    station_id CHAR(36) NOT NULL,
    last_sequence BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT pk_station_command_sequences PRIMARY KEY (station_id),
    CONSTRAINT fk_station_command_sequence_station FOREIGN KEY (station_id) REFERENCES physical_resources(id),
    CONSTRAINT chk_station_command_sequence_nonnegative CHECK (last_sequence >= 0)
);

INSERT INTO station_command_sequences (station_id, last_sequence, updated_at)
SELECT resource_id, 0, CURRENT_TIMESTAMP(6) FROM gaming_station_profiles;

CREATE TABLE station_commands (
    id CHAR(36) NOT NULL,
    station_id CHAR(36) NOT NULL,
    session_id CHAR(36) NOT NULL,
    sequence BIGINT NOT NULL,
    command_type VARCHAR(30) NOT NULL,
    payload_version INT NOT NULL DEFAULT 1,
    payload TEXT NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    available_at TIMESTAMP(6) NOT NULL,
    acknowledged_at TIMESTAMP(6) NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_station_commands PRIMARY KEY (id),
    CONSTRAINT fk_station_command_station FOREIGN KEY (station_id) REFERENCES physical_resources(id),
    CONSTRAINT fk_station_command_session FOREIGN KEY (session_id) REFERENCES gaming_sessions(id),
    CONSTRAINT uk_station_command_sequence UNIQUE (station_id, sequence),
    CONSTRAINT chk_station_command_sequence_positive CHECK (sequence > 0),
    CONSTRAINT chk_station_command_type CHECK (command_type IN ('SESSION_STARTED','SESSION_EXTENDED','SESSION_TERMINATED')),
    CONSTRAINT chk_station_command_payload_version CHECK (payload_version > 0),
    CONSTRAINT chk_station_command_retention CHECK (expires_at > created_at),
    CONSTRAINT chk_station_command_ack CHECK (acknowledged_at IS NULL OR acknowledged_at >= available_at)
);

CREATE INDEX idx_station_command_cursor ON station_commands (station_id, sequence, available_at);
CREATE INDEX idx_station_command_ack ON station_commands (station_id, acknowledged_at, sequence);
CREATE INDEX idx_station_command_retention ON station_commands (expires_at, acknowledged_at);
CREATE INDEX idx_station_command_session ON station_commands (session_id, sequence);
