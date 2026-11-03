CREATE TABLE station_client_updates (
 id CHAR(36) PRIMARY KEY,
 station_id CHAR(36) NOT NULL,
 target_version VARCHAR(40) NOT NULL,
 status VARCHAR(24) NOT NULL,
 requested_by CHAR(36) NULL,
 claimed_by CHAR(36) NULL,
 claim_until TIMESTAMP(6) NULL,
 requested_at TIMESTAMP(6) NOT NULL,
 not_before TIMESTAMP(6) NOT NULL,
 expires_at TIMESTAMP(6) NOT NULL,
 updated_at TIMESTAMP(6) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 CONSTRAINT fk_client_update_station FOREIGN KEY(station_id) REFERENCES physical_resources(id),
 CONSTRAINT fk_client_update_actor FOREIGN KEY(requested_by) REFERENCES users(id),
 CONSTRAINT fk_client_update_identity FOREIGN KEY(claimed_by) REFERENCES station_machine_identities(id),
 CONSTRAINT chk_client_update_status CHECK(status IN ('REQUESTED','DEFERRED','DOWNLOADING','INSTALLING','APPLIED','FAILED','EXPIRED','SUPERSEDED')),
 CONSTRAINT chk_client_update_deadline CHECK(expires_at>not_before)
);
CREATE INDEX idx_client_update_station ON station_client_updates(station_id,requested_at);
