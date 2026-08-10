CREATE TABLE workflow_definitions (
 id CHAR(36) PRIMARY KEY, definition_key VARCHAR(60) NOT NULL, name VARCHAR(120) NOT NULL,
 active_version INT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT uk_workflow_definition_key UNIQUE(definition_key)
);
CREATE TABLE workflow_definition_versions (
 id CHAR(36) PRIMARY KEY, definition_id CHAR(36) NOT NULL, version_number INT NOT NULL,
 schema_json TEXT NOT NULL, published_by CHAR(36) NOT NULL, published_at TIMESTAMP(6) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_workflow_version_definition FOREIGN KEY(definition_id) REFERENCES workflow_definitions(id),
 CONSTRAINT fk_workflow_version_publisher FOREIGN KEY(published_by) REFERENCES users(id),
 CONSTRAINT uk_workflow_definition_version UNIQUE(definition_id, version_number)
);
CREATE TABLE workflow_instances (
 id CHAR(36) PRIMARY KEY, definition_version_id CHAR(36) NOT NULL, requester_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, amount DECIMAL(12,2) NOT NULL, description VARCHAR(1000) NOT NULL,
 status VARCHAR(24) NOT NULL, current_step_key VARCHAR(60), due_at TIMESTAMP(6), escalated BOOLEAN NOT NULL DEFAULT FALSE,
 completed_at TIMESTAMP(6), created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_workflow_instance_version FOREIGN KEY(definition_version_id) REFERENCES workflow_definition_versions(id),
 CONSTRAINT fk_workflow_instance_requester FOREIGN KEY(requester_id) REFERENCES users(id)
);
CREATE INDEX idx_workflow_instance_requester ON workflow_instances(requester_id, created_at);
CREATE INDEX idx_workflow_instance_status_due ON workflow_instances(status, due_at);
CREATE TABLE workflow_steps (
 id CHAR(36) PRIMARY KEY, instance_id CHAR(36) NOT NULL, step_key VARCHAR(60) NOT NULL,
 assignee_id CHAR(36), assignee_role VARCHAR(30) NOT NULL, status VARCHAR(24) NOT NULL,
 started_at TIMESTAMP(6) NOT NULL, due_at TIMESTAMP(6) NOT NULL, reminder_at TIMESTAMP(6), reminded_at TIMESTAMP(6), completed_at TIMESTAMP(6),
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_workflow_step_instance FOREIGN KEY(instance_id) REFERENCES workflow_instances(id),
 CONSTRAINT fk_workflow_step_assignee FOREIGN KEY(assignee_id) REFERENCES users(id)
);
CREATE INDEX idx_workflow_step_inbox ON workflow_steps(status, assignee_role, assignee_id, due_at);
CREATE TABLE workflow_decisions (
 id CHAR(36) PRIMARY KEY, instance_id CHAR(36) NOT NULL, step_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL, action VARCHAR(24) NOT NULL, reason VARCHAR(500),
 from_step_key VARCHAR(60) NOT NULL, to_step_key VARCHAR(60), decided_at TIMESTAMP(6) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_workflow_decision_instance FOREIGN KEY(instance_id) REFERENCES workflow_instances(id),
 CONSTRAINT fk_workflow_decision_step FOREIGN KEY(step_id) REFERENCES workflow_steps(id),
 CONSTRAINT fk_workflow_decision_actor FOREIGN KEY(actor_id) REFERENCES users(id)
);
CREATE INDEX idx_workflow_decision_timeline ON workflow_decisions(instance_id, decided_at);
CREATE TABLE workflow_comments (
 id CHAR(36) PRIMARY KEY, instance_id CHAR(36) NOT NULL, author_id CHAR(36) NOT NULL, body VARCHAR(1000) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_workflow_comment_instance FOREIGN KEY(instance_id) REFERENCES workflow_instances(id),
 CONSTRAINT fk_workflow_comment_author FOREIGN KEY(author_id) REFERENCES users(id)
);
CREATE INDEX idx_workflow_comment_timeline ON workflow_comments(instance_id, created_at);
CREATE TABLE workflow_document_links (
 id CHAR(36) PRIMARY KEY, instance_id CHAR(36) NOT NULL, document_id CHAR(36) NOT NULL, linked_by CHAR(36) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_workflow_link_instance FOREIGN KEY(instance_id) REFERENCES workflow_instances(id),
 CONSTRAINT fk_workflow_link_document FOREIGN KEY(document_id) REFERENCES documents(id),
 CONSTRAINT fk_workflow_link_actor FOREIGN KEY(linked_by) REFERENCES users(id),
 CONSTRAINT uk_workflow_instance_document UNIQUE(instance_id, document_id)
);
