-- Run only against a disposable performance database after normal Flyway migration.
-- Set @customer_id and @product_id to existing test data created through the application.
DELETE FROM order_items WHERE id LIKE '10000000-0000-4000-8000-%';
DELETE FROM orders WHERE id LIKE '00000000-0000-4000-8000-%';

INSERT INTO orders (id, customer_id, handled_by, status, total_price, created_at, updated_at, version)
WITH RECURSIVE sequence(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM sequence WHERE n < 1000
)
SELECT CONCAT('00000000-0000-4000-8000-', LPAD(n, 12, '0')), @customer_id, NULL,
       CASE WHEN MOD(n, 4) = 0 THEN 'COMPLETED' ELSE 'CREATED' END,
       100.00 + MOD(n, 50),
       UTC_TIMESTAMP(6) - INTERVAL MOD(n, 90) DAY,
       UTC_TIMESTAMP(6), 0
FROM sequence;

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, line_total)
WITH RECURSIVE sequence(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM sequence WHERE n < 1000
)
SELECT CONCAT('10000000-0000-4000-8000-', LPAD(n, 12, '0')),
       CONCAT('00000000-0000-4000-8000-', LPAD(n, 12, '0')),
       @product_id, 1, 100.00 + MOD(n, 50), 100.00 + MOD(n, 50)
FROM sequence;
