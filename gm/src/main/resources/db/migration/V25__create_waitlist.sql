CREATE TABLE waitlist_entries (
    id CHAR(36) NOT NULL,
    customer_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    service_id CHAR(36) NOT NULL,
    desired_start TIMESTAMP(6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    active_key VARCHAR(180) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_waitlist_entries PRIMARY KEY (id),
    CONSTRAINT fk_waitlist_customer FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT fk_waitlist_employee FOREIGN KEY (employee_id) REFERENCES users(id),
    CONSTRAINT fk_waitlist_service FOREIGN KEY (service_id) REFERENCES catalog_items(id),
    CONSTRAINT uk_waitlist_active UNIQUE (active_key)
);

CREATE INDEX idx_waitlist_match ON waitlist_entries(status, desired_start, created_at);
CREATE INDEX idx_waitlist_customer ON waitlist_entries(customer_id, created_at);

CREATE TABLE waitlist_offers (
    id CHAR(36) NOT NULL,
    entry_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    reservation_id CHAR(36) NULL,
    active_key CHAR(36) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_waitlist_offers PRIMARY KEY (id),
    CONSTRAINT fk_waitlist_offer_entry FOREIGN KEY (entry_id) REFERENCES waitlist_entries(id),
    CONSTRAINT fk_waitlist_offer_employee FOREIGN KEY (employee_id) REFERENCES users(id),
    CONSTRAINT fk_waitlist_offer_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    CONSTRAINT uk_waitlist_offer_active UNIQUE (active_key)
);

CREATE INDEX idx_waitlist_offer_expiry ON waitlist_offers(status, expires_at);
