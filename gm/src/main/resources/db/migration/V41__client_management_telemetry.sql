ALTER TABLE station_heartbeats ADD COLUMN installation_status VARCHAR(30) NULL;
ALTER TABLE station_heartbeats ADD COLUMN update_status VARCHAR(30) NULL;
ALTER TABLE station_heartbeats ADD COLUMN maintenance_active BOOLEAN NULL;
ALTER TABLE station_heartbeats ADD COLUMN client_error_code VARCHAR(80) NULL;
