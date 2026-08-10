CREATE INDEX idx_orders_handler_created
    ON orders (handled_by, created_at);

CREATE INDEX idx_reservations_customer_status_time
    ON reservations (customer_id, status, start_time);

CREATE INDEX idx_audit_visibility_created
    ON audit_events (visibility, created_at);
