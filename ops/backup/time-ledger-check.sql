-- Read-only persistent-time checks; output one count, never customer information.
SELECT COUNT(*) FROM gaming_time_accounts a
WHERE a.balance_seconds<0 OR a.balance_seconds<>
 COALESCE((SELECT SUM(t.delta_seconds) FROM gaming_time_ledger t WHERE t.customer_id=a.customer_id),0);
