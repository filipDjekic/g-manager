ALTER TABLE gaming_sessions MODIFY COLUMN customer_id CHAR(36) NULL;
ALTER TABLE gaming_sessions ADD COLUMN legacy_minutes INT NOT NULL DEFAULT 0;
UPDATE gaming_sessions SET legacy_minutes=GREATEST(1,TIMESTAMPDIFF(MINUTE,started_at,ends_at));
ALTER TABLE gaming_sessions ADD COLUMN guest_name VARCHAR(120) NULL;
ALTER TABLE gaming_sessions ADD COLUMN move_target_id CHAR(36) NULL;
ALTER TABLE gaming_sessions ADD COLUMN move_remaining_seconds BIGINT NULL;
CREATE INDEX idx_gaming_session_move_target ON gaming_sessions(move_target_id,status);
ALTER TABLE gaming_sessions ADD CONSTRAINT chk_gaming_session_guest CHECK ((customer_id IS NOT NULL AND guest_name IS NULL) OR (customer_id IS NULL AND guest_name IS NOT NULL));
ALTER TABLE gaming_sessions ADD CONSTRAINT chk_gaming_session_move CHECK ((move_target_id IS NULL AND move_remaining_seconds IS NULL) OR (move_target_id IS NOT NULL AND move_target_id<>resource_id AND move_remaining_seconds>0));
ALTER TABLE gaming_sessions ADD CONSTRAINT fk_session_move_target FOREIGN KEY (move_target_id) REFERENCES physical_resources(id);

CREATE TABLE gaming_business_policy (
 id INT PRIMARY KEY, allow_partial BOOLEAN NOT NULL, allow_debt BOOLEAN NOT NULL, allow_refunds BOOLEAN NOT NULL,
 minimum_minutes INT NOT NULL, maximum_minutes INT NOT NULL, employee_discount_limit DECIMAL(5,2) NOT NULL, version BIGINT NOT NULL,
 CONSTRAINT chk_gaming_policy CHECK (minimum_minutes>0 AND maximum_minutes>=minimum_minutes AND maximum_minutes<=1440 AND employee_discount_limit BETWEEN 0 AND 100)
);
INSERT INTO gaming_business_policy VALUES (1,FALSE,FALSE,FALSE,15,480,0.00,0);
CREATE TABLE gaming_tariffs (
 id CHAR(36) PRIMARY KEY, name VARCHAR(120) NOT NULL, service_id CHAR(36) NULL, minutes INT NOT NULL,
 price DECIMAL(14,2) NOT NULL, currency CHAR(3) NOT NULL, active BOOLEAN NOT NULL, valid_from TIMESTAMP(6) NULL,
 valid_until TIMESTAMP(6) NULL, package_validity_days INT NOT NULL, version BIGINT NOT NULL,
 CONSTRAINT fk_tariff_service FOREIGN KEY (service_id) REFERENCES catalog_items(id),
 CONSTRAINT chk_tariff CHECK (minutes>0 AND minutes<=1440 AND price>0 AND currency='RSD' AND package_validity_days>=0)
);
CREATE TABLE gaming_charges (
 id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL, resource_id CHAR(36) NOT NULL, location_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL, minutes INT NOT NULL, amount DECIMAL(14,2) NOT NULL, recognized_amount DECIMAL(14,2) NOT NULL,
 currency CHAR(3) NOT NULL, snapshot TEXT NOT NULL, created_at TIMESTAMP(6) NOT NULL,
 CONSTRAINT fk_charge_session FOREIGN KEY (session_id) REFERENCES gaming_sessions(id),
 CONSTRAINT fk_charge_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id),
 CONSTRAINT fk_charge_location FOREIGN KEY (location_id) REFERENCES locations(id),
 CONSTRAINT fk_charge_actor FOREIGN KEY (actor_id) REFERENCES users(id),
 CONSTRAINT chk_charge CHECK (minutes>0 AND amount>=0 AND recognized_amount>=0 AND currency='RSD')
);
CREATE INDEX idx_gaming_charge_session ON gaming_charges(session_id);
CREATE TABLE gaming_financial_operations (
 id CHAR(36) PRIMARY KEY, session_id CHAR(36) NULL, customer_id CHAR(36) NULL, resource_id CHAR(36) NOT NULL,
 location_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL, kind VARCHAR(30) NOT NULL, method VARCHAR(30) NOT NULL,
 amount DECIMAL(14,2) NOT NULL, currency CHAR(3) NOT NULL, status VARCHAR(20) NOT NULL, reference VARCHAR(160) NULL,
 reason VARCHAR(500) NULL, original_id CHAR(36) NULL, created_at TIMESTAMP(6) NOT NULL,
 CONSTRAINT fk_fin_session FOREIGN KEY (session_id) REFERENCES gaming_sessions(id),
 CONSTRAINT fk_fin_customer FOREIGN KEY (customer_id) REFERENCES users(id),
 CONSTRAINT fk_fin_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id),
 CONSTRAINT fk_fin_location FOREIGN KEY (location_id) REFERENCES locations(id),
 CONSTRAINT fk_fin_actor FOREIGN KEY (actor_id) REFERENCES users(id),
 CONSTRAINT fk_fin_original FOREIGN KEY (original_id) REFERENCES gaming_financial_operations(id),
 CONSTRAINT chk_fin_amount CHECK (amount>0 AND currency='RSD' AND status='RECORDED'),
 CONSTRAINT chk_fin_method CHECK (method IN ('CASH','EXTERNAL_POS','WALLET')),
 CONSTRAINT chk_fin_kind CHECK (kind IN ('PAYMENT','REFUND','CREDIT_TOPUP','PACKAGE_SALE','CREDIT_CORRECTION'))
);
CREATE INDEX idx_fin_session ON gaming_financial_operations(session_id);
CREATE INDEX idx_fin_original ON gaming_financial_operations(original_id);
CREATE INDEX idx_fin_reporting ON gaming_financial_operations(created_at,location_id,kind);
CREATE TABLE gaming_time_packages (
 id CHAR(36) PRIMARY KEY, customer_id CHAR(36) NOT NULL, tariff_id CHAR(36) NOT NULL, service_id CHAR(36) NULL,
 minutes INT NOT NULL, price DECIMAL(14,2) NOT NULL, expires_at TIMESTAMP(6) NULL, snapshot TEXT NOT NULL, created_at TIMESTAMP(6) NOT NULL,
 CONSTRAINT fk_package_customer FOREIGN KEY (customer_id) REFERENCES users(id),
 CONSTRAINT fk_package_tariff FOREIGN KEY (tariff_id) REFERENCES gaming_tariffs(id),
 CONSTRAINT fk_package_service FOREIGN KEY (service_id) REFERENCES catalog_items(id),
 CONSTRAINT chk_package CHECK (minutes>0 AND price>0)
);
CREATE TABLE gaming_wallet_ledger (
 id CHAR(36) PRIMARY KEY, customer_id CHAR(36) NOT NULL, session_id CHAR(36) NULL, package_id CHAR(36) NULL, operation_id CHAR(36) NULL,
 amount DECIMAL(14,2) NOT NULL, minutes INT NOT NULL, currency CHAR(3) NOT NULL, kind VARCHAR(30) NOT NULL,
 actor_id CHAR(36) NOT NULL, reason VARCHAR(500) NULL, created_at TIMESTAMP(6) NOT NULL,
 CONSTRAINT fk_wallet_customer FOREIGN KEY (customer_id) REFERENCES users(id),
 CONSTRAINT fk_wallet_session FOREIGN KEY (session_id) REFERENCES gaming_sessions(id),
 CONSTRAINT fk_wallet_package FOREIGN KEY (package_id) REFERENCES gaming_time_packages(id),
 CONSTRAINT fk_wallet_actor FOREIGN KEY (actor_id) REFERENCES users(id),
 CONSTRAINT fk_wallet_operation FOREIGN KEY (operation_id) REFERENCES gaming_financial_operations(id),
 CONSTRAINT chk_wallet CHECK (currency='RSD' AND ((package_id IS NULL AND minutes=0 AND amount<>0) OR (package_id IS NOT NULL AND amount=0 AND minutes<>0)))
);
CREATE INDEX idx_wallet_customer ON gaming_wallet_ledger(customer_id);
CREATE INDEX idx_wallet_package ON gaming_wallet_ledger(package_id);
CREATE TABLE station_preparation (
 station_id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL, ready BOOLEAN NOT NULL DEFAULT FALSE,
 actor_id CHAR(36) NULL, reason VARCHAR(500) NULL, prepared_at TIMESTAMP(6) NULL,
 CONSTRAINT fk_prep_station FOREIGN KEY (station_id) REFERENCES physical_resources(id),
 CONSTRAINT fk_prep_session FOREIGN KEY (session_id) REFERENCES gaming_sessions(id),
 CONSTRAINT fk_prep_actor FOREIGN KEY (actor_id) REFERENCES users(id)
);
-- Existing used stations also require an explicit privacy review after rollout.
INSERT INTO station_preparation (station_id,session_id,ready)
 SELECT s.resource_id,s.id,FALSE FROM gaming_sessions s
 WHERE NOT EXISTS (SELECT newer.id FROM gaming_sessions newer WHERE newer.resource_id=s.resource_id
 AND (newer.started_at>s.started_at OR (newer.started_at=s.started_at AND newer.id>s.id)));
