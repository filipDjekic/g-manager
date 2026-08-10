CREATE TABLE dashboard_widget_preferences (
    id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL, widget_key VARCHAR(50) NOT NULL,
    widget_position INT NOT NULL, visible BOOLEAN NOT NULL DEFAULT TRUE, threshold DECIMAL(12,2) NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id), CONSTRAINT uk_dashboard_widget_owner_key UNIQUE (owner_id, widget_key),
    CONSTRAINT fk_dashboard_widget_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_dashboard_widget_owner_position ON dashboard_widget_preferences(owner_id, widget_position);
