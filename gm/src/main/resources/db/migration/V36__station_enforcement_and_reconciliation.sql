ALTER TABLE station_commands DROP CONSTRAINT chk_station_command_type;
ALTER TABLE station_commands ADD CONSTRAINT chk_station_command_type CHECK(command_type IN('SESSION_STARTED','SESSION_EXTENDED','SESSION_TERMINATED','FORCE_LOCK'));

CREATE TABLE station_client_enforcement (
 station_id CHAR(36) NOT NULL,identity_id CHAR(36) NULL,session_id CHAR(36) NULL,
 enforcement_status VARCHAR(30) NOT NULL,last_lease_id CHAR(36) NULL,last_lease_expires_at TIMESTAMP(6) NULL,
 last_config_version BIGINT NOT NULL DEFAULT 0,last_command_sequence BIGINT NOT NULL DEFAULT 0,
 last_lock_ack_at TIMESTAMP(6) NULL,client_reported_at TIMESTAMP(6) NULL,reason VARCHAR(500) NULL,
 created_at TIMESTAMP(6) NOT NULL,updated_at TIMESTAMP(6) NOT NULL,version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT pk_station_client_enforcement PRIMARY KEY(station_id),
 CONSTRAINT fk_enforcement_station FOREIGN KEY(station_id) REFERENCES physical_resources(id),
 CONSTRAINT fk_enforcement_identity FOREIGN KEY(identity_id) REFERENCES station_machine_identities(id),
 CONSTRAINT fk_enforcement_session FOREIGN KEY(session_id) REFERENCES gaming_sessions(id),
 CONSTRAINT chk_enforcement_status CHECK(enforcement_status IN('UNKNOWN','UNLOCKED','LOCK_PENDING','LOCKED','OFFLINE')),
 CONSTRAINT chk_enforcement_cursor CHECK(last_command_sequence>=0),CONSTRAINT chk_enforcement_config CHECK(last_config_version>=0)
);
CREATE INDEX idx_enforcement_status_update ON station_client_enforcement(enforcement_status,updated_at);
CREATE TABLE station_reconciliation_audit (
 id CHAR(36) NOT NULL,station_id CHAR(36) NOT NULL,session_id CHAR(36) NULL,actor_id CHAR(36) NULL,
 action VARCHAR(30) NOT NULL,previous_status VARCHAR(30) NULL,resulting_status VARCHAR(30) NOT NULL,
 command_sequence BIGINT NULL,details VARCHAR(1000) NULL,occurred_at TIMESTAMP(6) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL,updated_at TIMESTAMP(6) NOT NULL,version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT pk_station_reconciliation_audit PRIMARY KEY(id),CONSTRAINT fk_reconciliation_station FOREIGN KEY(station_id) REFERENCES physical_resources(id),
 CONSTRAINT fk_reconciliation_session FOREIGN KEY(session_id) REFERENCES gaming_sessions(id),CONSTRAINT fk_reconciliation_actor FOREIGN KEY(actor_id) REFERENCES users(id),
 CONSTRAINT chk_reconciliation_action CHECK(action IN('COMMAND_ISSUED','LOCK_ACK','FORCE_LOCK','OPERATOR_RECOVERY','LEASE_ISSUED'))
);
CREATE INDEX idx_reconciliation_station_time ON station_reconciliation_audit(station_id,occurred_at);
