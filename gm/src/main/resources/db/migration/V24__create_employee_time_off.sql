CREATE TABLE employee_time_off (
    id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    starts_at TIMESTAMP(6) NOT NULL,
    ends_at TIMESTAMP(6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    decision_reason VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_employee_time_off PRIMARY KEY (id),
    CONSTRAINT fk_employee_time_off_employee FOREIGN KEY (employee_id) REFERENCES users (id),
    CONSTRAINT ck_employee_time_off_range CHECK (ends_at > starts_at)
);

CREATE INDEX idx_employee_time_off_employee_range ON employee_time_off (employee_id, starts_at, ends_at);
CREATE INDEX idx_employee_time_off_status_range ON employee_time_off (status, starts_at, ends_at);
