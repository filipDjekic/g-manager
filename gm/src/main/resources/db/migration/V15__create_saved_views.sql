CREATE TABLE saved_views (
    id CHAR(36) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    resource_type VARCHAR(32) NOT NULL,
    name VARCHAR(80) NOT NULL,
    query_json TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_saved_views PRIMARY KEY (id),
    CONSTRAINT fk_saved_views_owner FOREIGN KEY (owner_id) REFERENCES users (id),
    CONSTRAINT uk_saved_views_owner_type_name UNIQUE (owner_id, resource_type, name)
);

CREATE INDEX idx_saved_views_owner_type ON saved_views (owner_id, resource_type);
