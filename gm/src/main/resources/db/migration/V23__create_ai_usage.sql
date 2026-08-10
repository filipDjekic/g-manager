CREATE TABLE ai_usage_events (
    id CHAR(36) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    report_id CHAR(36) NOT NULL,
    provider VARCHAR(40) NOT NULL,
    model VARCHAR(80) NOT NULL,
    prompt_version VARCHAR(30) NOT NULL,
    output_version VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    input_tokens INT NOT NULL,
    output_tokens INT NOT NULL,
    latency_ms BIGINT NOT NULL,
    feedback VARCHAR(20),
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_ai_usage_events PRIMARY KEY (id),
    CONSTRAINT fk_ai_usage_owner FOREIGN KEY (owner_id) REFERENCES users(id),
    CONSTRAINT fk_ai_usage_report FOREIGN KEY (report_id) REFERENCES report_requests(id),
    CONSTRAINT chk_ai_usage_tokens CHECK (input_tokens >= 0 AND output_tokens >= 0)
);
CREATE INDEX idx_ai_usage_owner_created ON ai_usage_events(owner_id, created_at);
