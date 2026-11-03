-- Read-only checks; output exactly one integer. No money or customer data is logged.
SELECT
 (SELECT COUNT(*) FROM (SELECT customer_id FROM gaming_wallet_ledger WHERE package_id IS NULL GROUP BY customer_id HAVING SUM(amount)<0) negative_wallets)
+(SELECT COUNT(*) FROM (SELECT p.id FROM gaming_time_packages p LEFT JOIN gaming_wallet_ledger l ON l.package_id=p.id GROUP BY p.id,p.minutes HAVING COALESCE(SUM(l.minutes),0)<0 OR COALESCE(SUM(l.minutes),0)>p.minutes) invalid_packages)
+(SELECT COUNT(*) FROM gaming_wallet_ledger WHERE amount<>0 AND operation_id IS NULL)
+(SELECT COUNT(*) FROM (SELECT p.id FROM gaming_financial_operations p JOIN gaming_financial_operations r ON r.original_id=p.id AND r.kind='REFUND' GROUP BY p.id,p.amount HAVING SUM(r.amount)>p.amount) excess_refunds);
