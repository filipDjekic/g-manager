-- Simulation is an explicit observation, never a physical Windows lock acknowledgement.
ALTER TABLE station_client_enforcement DROP CONSTRAINT chk_enforcement_status;
ALTER TABLE station_client_enforcement ADD CONSTRAINT chk_enforcement_status
 CHECK(enforcement_status IN('UNKNOWN','UNLOCKED','LOCK_PENDING','LOCKED','OFFLINE','DEV_READY','DEV_ACTIVE'));
