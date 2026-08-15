CREATE TABLE locations (
    id CHAR(36) NOT NULL, code VARCHAR(40) NOT NULL, name VARCHAR(120) NOT NULL,
    address VARCHAR(255) NOT NULL, description VARCHAR(500) NULL, timezone VARCHAR(60) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_locations PRIMARY KEY (id), CONSTRAINT uk_locations_code UNIQUE (code)
);

CREATE TABLE areas (
    id CHAR(36) NOT NULL, location_id CHAR(36) NOT NULL, code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL, description VARCHAR(500) NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0, map_width INT NOT NULL DEFAULT 1000,
    map_height INT NOT NULL DEFAULT 600, created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_areas PRIMARY KEY (id), CONSTRAINT fk_area_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT uk_area_code UNIQUE (location_id, code),
    CONSTRAINT chk_area_map_size CHECK (map_width > 0 AND map_height > 0)
);

CREATE TABLE physical_resources (
    id CHAR(36) NOT NULL, area_id CHAR(36) NOT NULL, service_id CHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL, name VARCHAR(120) NOT NULL, resource_type VARCHAR(30) NOT NULL,
    description VARCHAR(500) NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    bookable BOOLEAN NOT NULL DEFAULT TRUE, capacity INT NOT NULL DEFAULT 1,
    display_order INT NOT NULL DEFAULT 0, map_x INT NOT NULL DEFAULT 0, map_y INT NOT NULL DEFAULT 0,
    map_width INT NOT NULL DEFAULT 120, map_height INT NOT NULL DEFAULT 80, rotation INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_physical_resources PRIMARY KEY (id),
    CONSTRAINT fk_resource_area FOREIGN KEY (area_id) REFERENCES areas(id),
    CONSTRAINT fk_resource_service FOREIGN KEY (service_id) REFERENCES catalog_items(id),
    CONSTRAINT uk_resource_code UNIQUE (area_id, code),
    CONSTRAINT chk_resource_capacity CHECK (capacity > 0),
    CONSTRAINT chk_resource_map_size CHECK (map_width > 0 AND map_height > 0)
);

CREATE TABLE user_location_assignments (
    id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, location_id CHAR(36) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_user_location_assignments PRIMARY KEY (id),
    CONSTRAINT fk_user_location_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_location_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT uk_user_location UNIQUE (user_id, location_id)
);

ALTER TABLE reservations ADD COLUMN location_id CHAR(36) NULL;
ALTER TABLE reservations ADD COLUMN resource_id CHAR(36) NULL;
ALTER TABLE reservations ADD CONSTRAINT fk_reservation_location FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE reservations ADD CONSTRAINT fk_reservation_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id);
CREATE INDEX idx_reservation_resource_time ON reservations (resource_id, status, start_time, end_time);
CREATE INDEX idx_reservation_location_time ON reservations (location_id, start_time);
CREATE INDEX idx_resource_service ON physical_resources (service_id, active, bookable);
CREATE INDEX idx_area_location ON areas (location_id, active, display_order);

ALTER TABLE waitlist_entries ADD COLUMN location_id CHAR(36) NULL;
ALTER TABLE waitlist_entries ADD COLUMN resource_id CHAR(36) NULL;
ALTER TABLE waitlist_entries ADD COLUMN desired_end TIMESTAMP(6) NULL;
ALTER TABLE waitlist_entries ADD CONSTRAINT fk_waitlist_location FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE waitlist_entries ADD CONSTRAINT fk_waitlist_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id);
ALTER TABLE waitlist_offers ADD COLUMN resource_id CHAR(36) NULL;
ALTER TABLE waitlist_offers ADD CONSTRAINT fk_waitlist_offer_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id);
CREATE INDEX idx_waitlist_resource_time ON waitlist_entries (resource_id, status, desired_start, desired_end);

ALTER TABLE working_hours DROP CONSTRAINT uk_working_hours_day;
ALTER TABLE working_hours ADD COLUMN location_id CHAR(36) NULL;
ALTER TABLE working_hours ADD CONSTRAINT fk_working_hours_location FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE working_hours ADD CONSTRAINT uk_working_hours_location_day UNIQUE (location_id, day_of_week);
ALTER TABLE working_hours_exceptions DROP CONSTRAINT uk_working_hours_exception_date;
ALTER TABLE working_hours_exceptions ADD COLUMN location_id CHAR(36) NULL;
ALTER TABLE working_hours_exceptions ADD CONSTRAINT fk_working_hours_exception_location FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE working_hours_exceptions ADD CONSTRAINT uk_working_hours_exception_location_date UNIQUE (location_id, exception_date);
