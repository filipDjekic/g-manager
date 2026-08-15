CREATE TABLE application_definitions (
    id CHAR(36) NOT NULL, code VARCHAR(60) NOT NULL, name VARCHAR(120) NOT NULL,
    application_type VARCHAR(20) NOT NULL, executable_path VARCHAR(500) NOT NULL,
    publisher VARCHAR(255) NULL, executable_sha256 CHAR(64) NULL,
    default_arguments VARCHAR(1000) NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_application_definitions PRIMARY KEY (id),
    CONSTRAINT uk_application_definition_code UNIQUE (code),
    CONSTRAINT chk_application_definition_type CHECK (application_type IN ('LAUNCHER','GAME','HELPER')),
    CONSTRAINT chk_application_definition_sha CHECK (executable_sha256 IS NULL OR CHAR_LENGTH(executable_sha256) = 64)
);

CREATE TABLE application_profiles (
    id CHAR(36) NOT NULL, code VARCHAR(60) NOT NULL, name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    configuration_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_application_profiles PRIMARY KEY (id),
    CONSTRAINT uk_application_profile_code UNIQUE (code)
);

CREATE TABLE application_profile_entries (
    id CHAR(36) NOT NULL, profile_id CHAR(36) NOT NULL,
    application_definition_id CHAR(36) NOT NULL, required_process BOOLEAN NOT NULL DEFAULT FALSE,
    auto_start BOOLEAN NOT NULL DEFAULT FALSE, launch_order INT NOT NULL DEFAULT 0,
    arguments_override VARCHAR(1000) NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_application_profile_entries PRIMARY KEY (id),
    CONSTRAINT fk_profile_entry_profile FOREIGN KEY (profile_id) REFERENCES application_profiles(id),
    CONSTRAINT fk_profile_entry_definition FOREIGN KEY (application_definition_id) REFERENCES application_definitions(id),
    CONSTRAINT uk_profile_entry_definition UNIQUE (profile_id, application_definition_id),
    CONSTRAINT chk_profile_entry_order CHECK (launch_order >= 0)
);

CREATE TABLE gaming_station_profiles (
    id CHAR(36) NOT NULL, resource_id CHAR(36) NOT NULL,
    operational_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    application_profile_id CHAR(36) NULL, client_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    heartbeat_interval_seconds INT NOT NULL DEFAULT 10,
    offline_grace_seconds INT NOT NULL DEFAULT 60,
    last_heartbeat_at TIMESTAMP(6) NULL, client_version VARCHAR(60) NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_gaming_station_profiles PRIMARY KEY (id),
    CONSTRAINT uk_gaming_station_resource UNIQUE (resource_id),
    CONSTRAINT fk_gaming_station_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id),
    CONSTRAINT fk_gaming_station_application_profile FOREIGN KEY (application_profile_id) REFERENCES application_profiles(id),
    CONSTRAINT chk_gaming_station_status CHECK (operational_status IN ('AVAILABLE','MAINTENANCE','RETIRED')),
    CONSTRAINT chk_gaming_station_heartbeat CHECK (heartbeat_interval_seconds > 0),
    CONSTRAINT chk_gaming_station_offline_grace CHECK (offline_grace_seconds >= heartbeat_interval_seconds)
);

CREATE INDEX idx_application_definition_active ON application_definitions (active, application_type);
CREATE INDEX idx_application_profile_active ON application_profiles (active, name);
CREATE INDEX idx_profile_entry_order ON application_profile_entries (profile_id, launch_order);
CREATE INDEX idx_gaming_station_status ON gaming_station_profiles (operational_status, client_enabled);
