-- V51+: retired financial history is independent of current manual time payments.
-- Read-only checks; output exactly one count, without customer or financial data.
SELECT
 (SELECT COUNT(*) FROM (SELECT customer_id FROM gaming_history_wallet_entries WHERE package_id IS NULL GROUP BY customer_id HAVING SUM(amount)<0) negative_wallets)
+(SELECT COUNT(*) FROM (SELECT p.id FROM gaming_history_packages p LEFT JOIN gaming_history_wallet_entries l ON l.package_id=p.id GROUP BY p.id,p.minutes HAVING COALESCE(SUM(l.minutes),0)<0 OR COALESCE(SUM(l.minutes),0)>p.minutes) invalid_packages)
+(SELECT COUNT(*) FROM gaming_history_wallet_entries WHERE amount<>0 AND operation_id IS NULL)
+(SELECT COUNT(*) FROM (SELECT p.id FROM gaming_history_financial_operations p JOIN gaming_history_financial_operations r ON r.original_id=p.id AND r.kind='REFUND' GROUP BY p.id,p.amount HAVING SUM(r.amount)>p.amount) excess_historical_refunds)
+(SELECT COUNT(*) FROM (SELECT p.id FROM gaming_financial_operations p JOIN gaming_financial_operations r ON r.original_id=p.id AND r.kind='TIME_REFUND' GROUP BY p.id,p.amount HAVING SUM(r.amount)>p.amount) excess_time_refunds)
+(SELECT COUNT(*) FROM gaming_financial_operations WHERE kind NOT IN ('TIME_GRANT','TIME_REFUND') OR method NOT IN ('CASH','EXTERNAL_POS'));
