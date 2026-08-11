CREATE TABLE customer_crm_profiles (
 id CHAR(36) NOT NULL, customer_id CHAR(36) NOT NULL, created_at TIMESTAMP(6) NOT NULL,
 updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT pk_customer_crm_profiles PRIMARY KEY(id),
 CONSTRAINT uk_customer_crm_customer UNIQUE(customer_id),
 CONSTRAINT fk_customer_crm_customer FOREIGN KEY(customer_id) REFERENCES users(id)
);
CREATE TABLE customer_crm_notes (
 id CHAR(36) NOT NULL, profile_id CHAR(36) NOT NULL, body VARCHAR(1000) NOT NULL,
 created_by CHAR(36) NOT NULL, expires_at TIMESTAMP(6) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT pk_customer_crm_notes PRIMARY KEY(id),
 CONSTRAINT fk_customer_crm_note_profile FOREIGN KEY(profile_id) REFERENCES customer_crm_profiles(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_crm_note_actor FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX idx_customer_crm_note_profile_created ON customer_crm_notes(profile_id,created_at);
CREATE INDEX idx_customer_crm_note_expiry ON customer_crm_notes(expires_at);
CREATE TABLE customer_crm_tags (
 id CHAR(36) NOT NULL, name VARCHAR(60) NOT NULL, normalized_name VARCHAR(60) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT pk_customer_crm_tags PRIMARY KEY(id), CONSTRAINT uk_customer_crm_tag_name UNIQUE(normalized_name)
);
CREATE TABLE customer_crm_profile_tags (
 profile_id CHAR(36) NOT NULL, tag_id CHAR(36) NOT NULL,
 CONSTRAINT pk_customer_crm_profile_tags PRIMARY KEY(profile_id,tag_id),
 CONSTRAINT fk_customer_crm_profile_tag_profile FOREIGN KEY(profile_id) REFERENCES customer_crm_profiles(id) ON DELETE CASCADE,
 CONSTRAINT fk_customer_crm_profile_tag_tag FOREIGN KEY(tag_id) REFERENCES customer_crm_tags(id)
);
