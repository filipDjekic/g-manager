ALTER TABLE station_heartbeats
    ADD COLUMN installation_status VARCHAR(30) NULL,
    ADD COLUMN update_status VARCHAR(30) NULL,
    ADD COLUMN maintenance_active BOOLEAN NULL,
    ADD COLUMN client_error_code VARCHAR(80) NULL;
