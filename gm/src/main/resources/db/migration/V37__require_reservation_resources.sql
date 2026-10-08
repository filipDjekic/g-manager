ALTER TABLE catalog_items ADD COLUMN requires_resource BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE catalog_items SET requires_resource = TRUE
WHERE type = 'SERVICE' AND id IN (SELECT service_id FROM physical_resources);
