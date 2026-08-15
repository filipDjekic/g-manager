CREATE TABLE gaming_sessions (
    id CHAR(36) NOT NULL,
    customer_id CHAR(36) NOT NULL,
    resource_id CHAR(36) NOT NULL,
    location_id CHAR(36) NOT NULL,
    reservation_id CHAR(36) NULL,
    started_by CHAR(36) NOT NULL,
    started_at TIMESTAMP(6) NOT NULL,
    ends_at TIMESTAMP(6) NOT NULL,
    ended_at TIMESTAMP(6) NULL,
    status VARCHAR(20) NOT NULL,
    termination_reason VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_gaming_sessions PRIMARY KEY (id),
    CONSTRAINT fk_gaming_session_customer FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT fk_gaming_session_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id),
    CONSTRAINT fk_gaming_session_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT fk_gaming_session_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    CONSTRAINT fk_gaming_session_started_by FOREIGN KEY (started_by) REFERENCES users(id),
    CONSTRAINT chk_gaming_session_interval CHECK (ends_at > started_at),
    CONSTRAINT chk_gaming_session_status CHECK (status IN ('ACTIVE','EXPIRED','TERMINATED')),
    CONSTRAINT chk_gaming_session_terminal CHECK (
        (status = 'ACTIVE' AND ended_at IS NULL AND termination_reason IS NULL)
        OR (status = 'EXPIRED' AND ended_at IS NOT NULL)
        OR (status = 'TERMINATED' AND ended_at IS NOT NULL AND termination_reason IS NOT NULL)
    )
);

CREATE INDEX idx_gaming_session_resource_status ON gaming_sessions (resource_id, status);
CREATE INDEX idx_gaming_session_customer_status ON gaming_sessions (customer_id, status);
CREATE INDEX idx_gaming_session_location_status ON gaming_sessions (location_id, status, started_at);
CREATE INDEX idx_gaming_session_active_expiry ON gaming_sessions (status, ends_at);
CREATE INDEX idx_gaming_session_started_by ON gaming_sessions (started_by, started_at);
