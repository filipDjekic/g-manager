CREATE TABLE report_requests (
 id CHAR(36) PRIMARY KEY, owner_id CHAR(36) NOT NULL, job_id CHAR(36), definition_key VARCHAR(50) NOT NULL,
 format VARCHAR(10) NOT NULL, status VARCHAR(20) NOT NULL, filters_json TEXT NOT NULL,
 permission_snapshot VARCHAR(1000) NOT NULL, timezone VARCHAR(50) NOT NULL, locale VARCHAR(20) NOT NULL,
 snapshot_at TIMESTAMP(6) NOT NULL, progress INT NOT NULL DEFAULT 0, row_count BIGINT,
 document_id CHAR(36), error_message VARCHAR(500), expires_at TIMESTAMP(6),
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_report_owner FOREIGN KEY(owner_id) REFERENCES users(id),
 CONSTRAINT fk_report_document FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE INDEX idx_report_owner_created ON report_requests(owner_id, created_at);
CREATE INDEX idx_report_status_created ON report_requests(status, created_at);

CREATE TABLE report_schedules (
 id CHAR(36) PRIMARY KEY, owner_id CHAR(36) NOT NULL, definition_key VARCHAR(50) NOT NULL,
 format VARCHAR(10) NOT NULL, filters_json TEXT NOT NULL, timezone VARCHAR(50) NOT NULL,
 local_time TIME NOT NULL, day_of_week INT, active BOOLEAN NOT NULL DEFAULT TRUE,
 next_run_at TIMESTAMP(6) NOT NULL, last_run_at TIMESTAMP(6),
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_report_schedule_owner FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE INDEX idx_report_schedule_due ON report_schedules(active, next_run_at);
CREATE INDEX idx_report_schedule_owner ON report_schedules(owner_id, created_at);

CREATE TABLE report_templates (
 id CHAR(36) PRIMARY KEY, owner_id CHAR(36) NOT NULL, name VARCHAR(100) NOT NULL,
 definition_key VARCHAR(50) NOT NULL, format VARCHAR(10) NOT NULL, filters_json TEXT NOT NULL,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_report_template_owner FOREIGN KEY(owner_id) REFERENCES users(id),
 CONSTRAINT uk_report_template_owner_name UNIQUE(owner_id, name)
);
