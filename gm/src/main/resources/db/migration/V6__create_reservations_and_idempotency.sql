CREATE TABLE reservations (
    id CHAR(36) NOT NULL,
    customer_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    service_id CHAR(36) NOT NULL,
    start_time TIMESTAMP(6) NOT NULL,
    end_time TIMESTAMP(6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_reservations PRIMARY KEY (id),
    CONSTRAINT chk_reservation_interval CHECK (end_time > start_time)
);

CREATE INDEX idx_reservation_customer_time ON reservations (customer_id, start_time);
CREATE INDEX idx_reservation_employee_time
    ON reservations (employee_id, status, start_time, end_time);
CREATE INDEX idx_reservation_status_time ON reservations (status, start_time);

CREATE TABLE idempotency_keys (
    id CHAR(36) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_status INT NULL,
    response_body LONGTEXT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT pk_idempotency_keys PRIMARY KEY (id),
    CONSTRAINT uk_idempotency_key_endpoint UNIQUE (idempotency_key, endpoint)
);

CREATE INDEX idx_idempotency_expires_at ON idempotency_keys (expires_at);
