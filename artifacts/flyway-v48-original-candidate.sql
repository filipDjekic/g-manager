CREATE TABLE gaming_time_accounts (
 customer_id CHAR(36) PRIMARY KEY,
 balance_seconds BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_time_account_customer FOREIGN KEY(customer_id) REFERENCES users(id),
 CONSTRAINT chk_time_balance CHECK(balance_seconds>=0)
);
CREATE TABLE gaming_time_ledger (
 id CHAR(36) PRIMARY KEY, customer_id CHAR(36) NOT NULL, session_id CHAR(36) NULL,
 operation_id CHAR(36) NULL, actor_id CHAR(36) NOT NULL, delta_seconds BIGINT NOT NULL,
 balance_after BIGINT NOT NULL, kind VARCHAR(30) NOT NULL, reason VARCHAR(500) NULL,
 source_key VARCHAR(400) NOT NULL UNIQUE, created_at TIMESTAMP(6) NOT NULL,
 CONSTRAINT fk_time_customer FOREIGN KEY(customer_id) REFERENCES users(id),
 CONSTRAINT fk_time_entry_account FOREIGN KEY(customer_id) REFERENCES gaming_time_accounts(customer_id),
 CONSTRAINT fk_time_session FOREIGN KEY(session_id) REFERENCES gaming_sessions(id),
 CONSTRAINT fk_time_operation FOREIGN KEY(operation_id) REFERENCES gaming_financial_operations(id),
 CONSTRAINT fk_time_actor FOREIGN KEY(actor_id) REFERENCES users(id),
 CONSTRAINT chk_time_entry CHECK(delta_seconds<>0 AND balance_after>=0 AND
 (kind='CORRECTION' OR (kind IN ('MIGRATION','GRANT') AND delta_seconds>0) OR (kind IN ('CONSUMPTION','REVERSAL') AND delta_seconds<0)))
);
CREATE INDEX idx_time_history ON gaming_time_ledger(customer_id,created_at,id);
CREATE TABLE gaming_station_assignments (
 id CHAR(36) PRIMARY KEY, customer_id CHAR(36) NOT NULL, resource_id CHAR(36) NOT NULL,
 reservation_id CHAR(36) NULL, assigned_by CHAR(36) NOT NULL,
 status VARCHAR(24) NOT NULL, created_at TIMESTAMP(6) NOT NULL, expires_at TIMESTAMP(6) NOT NULL,
 access_until TIMESTAMP(6) NOT NULL, session_id CHAR(36) NULL,
 waiting_customer CHAR(36) GENERATED ALWAYS AS (CASE WHEN status='WAITING_FOR_LOGIN' THEN customer_id END) STORED,
 waiting_station CHAR(36) GENERATED ALWAYS AS (CASE WHEN status='WAITING_FOR_LOGIN' THEN resource_id END) STORED,
 CONSTRAINT uk_assignment_customer UNIQUE(waiting_customer), CONSTRAINT uk_assignment_station UNIQUE(waiting_station),
 CONSTRAINT fk_assignment_customer FOREIGN KEY(customer_id) REFERENCES users(id),
 CONSTRAINT fk_assignment_station FOREIGN KEY(resource_id) REFERENCES physical_resources(id),
 CONSTRAINT fk_assignment_actor FOREIGN KEY(assigned_by) REFERENCES users(id),
 CONSTRAINT fk_assignment_reservation FOREIGN KEY(reservation_id) REFERENCES reservations(id),
 CONSTRAINT fk_assignment_session FOREIGN KEY(session_id) REFERENCES gaming_sessions(id),
 CONSTRAINT chk_assignment CHECK(status IN ('WAITING_FOR_LOGIN','ACTIVATED','CANCELLED','EXPIRED') AND expires_at>created_at AND access_until>created_at)
);
ALTER TABLE gaming_sessions ADD COLUMN access_until TIMESTAMP(6) NULL;
ALTER TABLE gaming_sessions DROP CONSTRAINT chk_metered_session;
ALTER TABLE gaming_sessions ADD CONSTRAINT chk_metered_session CHECK (
 billing_mode IN ('FIXED_DURATION','PREPAID_METERED','TIME_BALANCE') AND charged_amount>=0 AND billed_seconds>=0
 AND (billing_mode='FIXED_DURATION' OR (customer_id IS NOT NULL AND metered_lease_until IS NOT NULL AND last_billed_at IS NOT NULL
 AND (billing_mode='TIME_BALANCE' OR (metered_tariff_id IS NOT NULL AND metered_price>0 AND metered_tariff_seconds>0 AND billing_unit_seconds>0)))));
ALTER TABLE gaming_sessions ADD CONSTRAINT chk_time_session CHECK(billing_mode<>'TIME_BALANCE' OR
 (metered_tariff_id IS NULL AND metered_price IS NULL AND metered_tariff_seconds IS NULL AND billing_unit_seconds IS NULL
 AND charged_amount=0 AND access_until IS NOT NULL AND ends_at<=access_until AND last_billed_at>=started_at));
ALTER TABLE gaming_sessions
 ADD COLUMN active_customer CHAR(36) GENERATED ALWAYS AS (CASE WHEN status='ACTIVE' THEN customer_id END) STORED,
 ADD COLUMN active_station CHAR(36) GENERATED ALWAYS AS (CASE WHEN status='ACTIVE' THEN resource_id END) STORED,
 ADD CONSTRAINT uk_active_customer UNIQUE(active_customer), ADD CONSTRAINT uk_active_station UNIQUE(active_station);
ALTER TABLE gaming_financial_operations DROP CONSTRAINT chk_fin_amount;
ALTER TABLE gaming_financial_operations DROP CONSTRAINT chk_fin_kind;
ALTER TABLE gaming_financial_operations MODIFY COLUMN resource_id CHAR(36) NULL;
ALTER TABLE gaming_financial_operations MODIFY COLUMN location_id CHAR(36) NULL;
ALTER TABLE gaming_financial_operations ADD COLUMN granted_seconds BIGINT NULL;
ALTER TABLE gaming_financial_operations ADD COLUMN grant_kind VARCHAR(24) NULL;
ALTER TABLE gaming_financial_operations ADD CONSTRAINT chk_fin_kind CHECK(kind IN ('PAYMENT','REFUND','CREDIT_TOPUP','PACKAGE_SALE','CREDIT_CORRECTION','TIME_GRANT','TIME_REFUND'));
ALTER TABLE gaming_financial_operations ADD CONSTRAINT chk_fin_amount CHECK(currency='RSD' AND status='RECORDED' AND
 ((kind='TIME_GRANT' AND amount>=0 AND granted_seconds IS NOT NULL AND granted_seconds>0 AND method IN ('CASH','EXTERNAL_POS') AND
 (amount>0 OR (grant_kind IS NOT NULL AND grant_kind IN ('FREE','PROMOTION','CORRECTION') AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason))>0))) OR (kind<>'TIME_GRANT' AND amount>0)));

-- Preserve purchased time; monetary credit is deliberately left untouched.
INSERT INTO gaming_time_accounts(customer_id) SELECT id FROM users WHERE role='CUSTOMER' OR id IN (SELECT customer_id FROM gaming_time_packages) OR id IN (SELECT customer_id FROM gaming_sessions WHERE customer_id IS NOT NULL);
INSERT INTO gaming_time_ledger(id,customer_id,actor_id,delta_seconds,balance_after,kind,reason,source_key,created_at)
 SELECT UUID(),p.customer_id,p.customer_id,SUM(l.minutes)*60,SUM(l.minutes)*60,'MIGRATION',
 'Unspent historical time packages; original package and financial records retained',CONCAT('legacy-packages:',p.customer_id),UTC_TIMESTAMP(6)
 FROM gaming_time_packages p JOIN gaming_wallet_ledger l ON l.package_id=p.id
 WHERE p.expires_at IS NULL OR p.expires_at>UTC_TIMESTAMP(6)
 GROUP BY p.customer_id HAVING SUM(l.minutes)>0;
UPDATE gaming_time_accounts a SET balance_seconds=COALESCE((SELECT SUM(l.delta_seconds) FROM gaming_time_ledger l WHERE l.customer_id=a.customer_id),0);
-- End legacy access explicitly. Preserve unused fixed-duration time for registered customers.
INSERT INTO gaming_time_ledger(id,customer_id,session_id,actor_id,delta_seconds,balance_after,kind,reason,source_key,created_at)
 SELECT UUID(),s.customer_id,s.id,s.started_by,COALESCE(s.move_remaining_seconds,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(6),s.ends_at)),
 a.balance_seconds+COALESCE(s.move_remaining_seconds,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(6),s.ends_at)),'MIGRATION','Unused legacy session time',CONCAT('legacy-session:',s.id),UTC_TIMESTAMP(6)
 FROM gaming_sessions s JOIN gaming_time_accounts a ON a.customer_id=s.customer_id
 WHERE s.status='ACTIVE' AND s.billing_mode='FIXED_DURATION' AND COALESCE(s.move_remaining_seconds,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(6),s.ends_at))>0;
UPDATE gaming_time_accounts a SET balance_seconds=COALESCE((SELECT SUM(l.delta_seconds) FROM gaming_time_ledger l WHERE l.customer_id=a.customer_id),0);
UPDATE gaming_sessions SET status='TERMINATED',ended_at=GREATEST(started_at,LEAST(ends_at,COALESCE(metered_lease_until,UTC_TIMESTAMP(6)),UTC_TIMESTAMP(6))),
 termination_reason='Manual time rollout: legacy access closed; monetary history retained',updated_at=UTC_TIMESTAMP(6),version=version+1
 WHERE status='ACTIVE';
-- Reconciliation issues real lock commands. No LOCK_ACK or enforcement state is fabricated.
