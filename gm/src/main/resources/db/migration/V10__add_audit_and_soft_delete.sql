ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP(6) NULL;
ALTER TABLE users ADD COLUMN deleted_by CHAR(36) NULL;
ALTER TABLE users ADD COLUMN deletion_reason VARCHAR(500) NULL;
ALTER TABLE catalog_items ADD COLUMN deleted_at TIMESTAMP(6) NULL;
ALTER TABLE catalog_items ADD COLUMN deleted_by CHAR(36) NULL;
ALTER TABLE catalog_items ADD COLUMN deletion_reason VARCHAR(500) NULL;

CREATE INDEX idx_users_deleted_at ON users (deleted_at);
CREATE INDEX idx_catalog_items_deleted_at ON catalog_items (deleted_at);

CREATE TABLE audit_events (
    id CHAR(36) NOT NULL,
    actor_id CHAR(36) NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(80) NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id CHAR(36) NOT NULL,
    before_data TEXT NULL,
    after_data TEXT NULL,
    reason VARCHAR(500) NULL,
    visibility VARCHAR(20) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_audit_events PRIMARY KEY (id)
);

CREATE INDEX idx_audit_events_created ON audit_events (created_at);
CREATE INDEX idx_audit_events_actor_created ON audit_events (actor_id, created_at);
CREATE INDEX idx_audit_events_resource_created ON audit_events (resource_type, resource_id, created_at);
CREATE INDEX idx_audit_events_action_created ON audit_events (action, created_at);
