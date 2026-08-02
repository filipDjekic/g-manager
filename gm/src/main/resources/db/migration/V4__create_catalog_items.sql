CREATE TABLE catalog_items (
    id CHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    type VARCHAR(20) NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    duration_minutes INT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    image_url VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_catalog_items PRIMARY KEY (id),
    CONSTRAINT chk_catalog_price_positive CHECK (price > 0),
    CONSTRAINT chk_catalog_duration_by_type CHECK (
        (type = 'SERVICE' AND duration_minutes IS NOT NULL AND duration_minutes > 0)
        OR (type = 'PRODUCT' AND duration_minutes IS NULL)
    )
);

CREATE INDEX idx_catalog_type_active ON catalog_items (type, active);
CREATE INDEX idx_catalog_active_created ON catalog_items (active, created_at);
CREATE INDEX idx_catalog_price ON catalog_items (price);
