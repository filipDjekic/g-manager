CREATE TABLE background_jobs (
    id CHAR(36) NOT NULL,
    job_type VARCHAR(80) NOT NULL,
    payload TEXT NOT NULL,
    dedupe_key VARCHAR(160) NULL,
    status VARCHAR(24) NOT NULL,
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL,
    available_at TIMESTAMP(6) NOT NULL,
    lease_owner VARCHAR(80) NULL,
    lease_token CHAR(36) NULL,
    lease_expires_at TIMESTAMP(6) NULL,
    timeout_seconds BIGINT NOT NULL,
    cancel_requested_at TIMESTAMP(6) NULL,
    started_at TIMESTAMP(6) NULL,
    completed_at TIMESTAMP(6) NULL,
    last_error VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_background_jobs_dedupe UNIQUE (dedupe_key)
);

CREATE INDEX idx_background_jobs_claim
    ON background_jobs (status, available_at, priority, created_at);
CREATE INDEX idx_background_jobs_lease
    ON background_jobs (status, lease_expires_at);

CREATE TABLE background_job_attempts (
    id CHAR(36) NOT NULL,
    job_id CHAR(36) NOT NULL,
    attempt_number INT NOT NULL,
    worker_id VARCHAR(80) NOT NULL,
    lease_token CHAR(36) NOT NULL,
    status VARCHAR(24) NOT NULL,
    started_at TIMESTAMP(6) NOT NULL,
    finished_at TIMESTAMP(6) NULL,
    error_message VARCHAR(500) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_job_attempt_job FOREIGN KEY (job_id) REFERENCES background_jobs (id),
    CONSTRAINT uk_job_attempt_number UNIQUE (job_id, attempt_number)
);

CREATE INDEX idx_job_attempt_job_started ON background_job_attempts (job_id, started_at);
