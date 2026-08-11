CREATE TABLE reservation_recurrence_series (
    id CHAR(36) NOT NULL,
    customer_id CHAR(36) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    interval_value INT NOT NULL,
    requested_occurrences INT NOT NULL,
    conflict_policy VARCHAR(30) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_reservation_recurrence_series PRIMARY KEY (id),
    CONSTRAINT fk_recurrence_customer FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT ck_recurrence_interval CHECK (interval_value BETWEEN 1 AND 4),
    CONSTRAINT ck_recurrence_occurrences CHECK (requested_occurrences BETWEEN 2 AND 20)
);

ALTER TABLE reservations ADD COLUMN recurrence_series_id CHAR(36) NULL;
ALTER TABLE reservations ADD CONSTRAINT fk_reservation_recurrence_series
    FOREIGN KEY (recurrence_series_id) REFERENCES reservation_recurrence_series(id);
CREATE INDEX idx_reservation_recurrence_series ON reservations(recurrence_series_id, start_time);
