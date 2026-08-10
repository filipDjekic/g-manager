CREATE TABLE outbox_events (
    id CHAR(36) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    schema_version INT NOT NULL,
    aggregate_type VARCHAR(40) NOT NULL,
    aggregate_id CHAR(36) NOT NULL,
    occurred_at TIMESTAMP(6) NOT NULL,
    correlation_id VARCHAR(80) NOT NULL,
    payload TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    available_at TIMESTAMP(6) NOT NULL,
    claimed_by VARCHAR(80) NULL,
    claimed_at TIMESTAMP(6) NULL,
    processed_at TIMESTAMP(6) NULL,
    last_error VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX idx_outbox_claim ON outbox_events (status, available_at, created_at);
CREATE INDEX idx_outbox_aggregate ON outbox_events (aggregate_type, aggregate_id, created_at);

CREATE TABLE outbox_consumer_receipts (
    consumer_name VARCHAR(80) NOT NULL,
    event_id CHAR(36) NOT NULL,
    processed_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (consumer_name, event_id),
    CONSTRAINT fk_outbox_receipt_event FOREIGN KEY (event_id) REFERENCES outbox_events (id)
);

CREATE INDEX idx_outbox_receipt_processed ON outbox_consumer_receipts (processed_at);
