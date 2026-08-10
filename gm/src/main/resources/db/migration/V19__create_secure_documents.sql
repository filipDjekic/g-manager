CREATE TABLE documents (
 id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL, resource_type VARCHAR(40) NOT NULL,
 resource_id CHAR(36) NOT NULL, display_name VARCHAR(255) NOT NULL, deleted_at TIMESTAMP(6) NULL,
 deleted_by CHAR(36) NULL, created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL,
 version BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(id),
 CONSTRAINT fk_document_owner FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE INDEX idx_document_resource ON documents(resource_type,resource_id,deleted_at,created_at);
CREATE INDEX idx_document_owner ON documents(owner_id,deleted_at);
CREATE TABLE document_versions (
 id CHAR(36) NOT NULL, document_id CHAR(36) NOT NULL, version_number INT NOT NULL,
 object_key VARCHAR(500) NOT NULL, original_filename VARCHAR(255) NOT NULL,
 content_type VARCHAR(100) NOT NULL, size_bytes BIGINT NOT NULL, checksum_sha256 VARCHAR(64) NOT NULL,
 scan_status VARCHAR(20) NOT NULL, scan_detail VARCHAR(255) NULL, scanned_at TIMESTAMP(6) NULL,
 created_by CHAR(36) NOT NULL, created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL,
 version BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(id),
 CONSTRAINT uk_document_version UNIQUE(document_id,version_number),
 CONSTRAINT uk_document_object_key UNIQUE(object_key),
 CONSTRAINT fk_document_version_document FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
 CONSTRAINT fk_document_version_creator FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX idx_document_version_scan ON document_versions(scan_status,created_at);
CREATE TABLE legacy_media_inventory (
 id CHAR(36) NOT NULL, legacy_url VARCHAR(500) NOT NULL, document_id CHAR(36) NULL,
 source_checksum_sha256 VARCHAR(64) NULL, migrated_checksum_sha256 VARCHAR(64) NULL,
 status VARCHAR(20) NOT NULL, checked_at TIMESTAMP(6) NULL, created_at TIMESTAMP(6) NOT NULL,
 PRIMARY KEY(id), CONSTRAINT uk_legacy_media_url UNIQUE(legacy_url),
 CONSTRAINT fk_legacy_media_document FOREIGN KEY(document_id) REFERENCES documents(id)
);
INSERT INTO legacy_media_inventory(id,legacy_url,status,created_at)
 SELECT id,avatar_url,'DISCOVERED',CURRENT_TIMESTAMP(6) FROM users WHERE avatar_url LIKE '/media/%';
INSERT INTO legacy_media_inventory(id,legacy_url,status,created_at)
 SELECT id,image_url,'DISCOVERED',CURRENT_TIMESTAMP(6) FROM catalog_items WHERE image_url LIKE '/media/%';
