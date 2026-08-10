CREATE TABLE search_preferences (
    id CHAR(36) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    resource_type VARCHAR(24) NOT NULL,
    resource_id CHAR(36) NOT NULL,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    last_accessed_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_search_preferences PRIMARY KEY (id),
    CONSTRAINT fk_search_preferences_owner FOREIGN KEY (owner_id) REFERENCES users (id),
    CONSTRAINT uk_search_preferences_owner_resource UNIQUE (owner_id, resource_type, resource_id)
);

CREATE INDEX idx_search_preferences_owner_recent
    ON search_preferences (owner_id, last_accessed_at);
CREATE INDEX idx_search_preferences_owner_favorite
    ON search_preferences (owner_id, favorite, updated_at);
