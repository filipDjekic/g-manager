-- V48 is immutable. Restore only historical package seconds that V48 did not convert.
-- Compare against the original conversion, not against today's balance: gaming may
-- already have consumed part of that balance. Never convert monetary credit.
START TRANSACTION;

INSERT INTO gaming_time_ledger
 (id,customer_id,actor_id,delta_seconds,balance_after,kind,reason,source_key,created_at)
SELECT UUID(),a.customer_id,a.customer_id,
 p.seconds-COALESCE(m.seconds,0),a.balance_seconds+p.seconds-COALESCE(m.seconds,0),
 'MIGRATION','Unconverted historical package time; calendar expiry removed',
 CONCAT('legacy-packages-no-expiry:',a.customer_id),CURRENT_TIMESTAMP(6)
FROM gaming_time_accounts a
JOIN (
 SELECT p.customer_id,SUM(l.minutes)*60 AS seconds
 FROM gaming_time_packages p JOIN gaming_wallet_ledger l ON l.package_id=p.id
 GROUP BY p.customer_id
) p ON p.customer_id=a.customer_id
LEFT JOIN (
 SELECT customer_id,SUM(delta_seconds) AS seconds FROM gaming_time_ledger
 WHERE kind='MIGRATION' AND source_key=CONCAT('legacy-packages:',customer_id)
 GROUP BY customer_id
) m ON m.customer_id=a.customer_id
WHERE p.seconds>COALESCE(m.seconds,0)
 AND NOT EXISTS (
  SELECT 1 FROM gaming_time_ledger restored
  WHERE restored.source_key=CONCAT('legacy-packages-no-expiry:',a.customer_id)
 );

-- The ledger is authoritative. This also makes a replay harmless: existing
-- consumption and purchases remain included, and the conversion has a unique key.
UPDATE gaming_time_accounts a
SET balance_seconds=(SELECT COALESCE(SUM(l.delta_seconds),0)
 FROM gaming_time_ledger l WHERE l.customer_id=a.customer_id)
WHERE EXISTS (SELECT 1 FROM gaming_time_ledger restored
 WHERE restored.source_key=CONCAT('legacy-packages-no-expiry:',a.customer_id));

COMMIT;
