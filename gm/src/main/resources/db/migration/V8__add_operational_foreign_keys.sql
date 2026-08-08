ALTER TABLE reservations
    ADD CONSTRAINT fk_reservations_customer FOREIGN KEY (customer_id) REFERENCES users (id);
ALTER TABLE reservations
    ADD CONSTRAINT fk_reservations_employee FOREIGN KEY (employee_id) REFERENCES users (id);
ALTER TABLE reservations
    ADD CONSTRAINT fk_reservations_service FOREIGN KEY (service_id) REFERENCES catalog_items (id);

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES users (id);
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_handler FOREIGN KEY (handled_by) REFERENCES users (id);

ALTER TABLE order_items
    ADD CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES catalog_items (id);
