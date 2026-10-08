CREATE TABLE user_resource_assignments (
    id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, resource_id CHAR(36) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_user_resource_assignments PRIMARY KEY (id),
    CONSTRAINT fk_resource_assignment_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_resource_assignment_resource FOREIGN KEY (resource_id) REFERENCES physical_resources(id),
    CONSTRAINT uk_user_resource UNIQUE (user_id, resource_id)
);
CREATE INDEX idx_resource_assignment_resource ON user_resource_assignments (resource_id, active);
-- Preserve existing access once, at migration time, without changing any reservation or session.
INSERT INTO user_resource_assignments (id,user_id,resource_id,active,created_at,updated_at,version)
SELECT UUID(), la.user_id, r.id, la.active, la.created_at, la.updated_at, 0
FROM user_location_assignments la
JOIN areas a ON a.location_id=la.location_id
JOIN physical_resources r ON r.area_id=a.id
JOIN users u ON u.id=la.user_id AND u.role='EMPLOYEE';
