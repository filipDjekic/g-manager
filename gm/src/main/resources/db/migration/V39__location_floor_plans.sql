CREATE TABLE location_floor_plans (
    id CHAR(36) NOT NULL PRIMARY KEY,
    location_id CHAR(36) NOT NULL,
    geometry_json LONGTEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_location_floor_plan UNIQUE (location_id),
    CONSTRAINT fk_floor_plan_location FOREIGN KEY (location_id) REFERENCES locations(id)
);
