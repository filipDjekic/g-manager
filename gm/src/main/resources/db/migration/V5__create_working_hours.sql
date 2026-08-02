CREATE TABLE working_hours (
    id CHAR(36) NOT NULL,
    day_of_week VARCHAR(10) NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_working_hours PRIMARY KEY (id),
    CONSTRAINT uk_working_hours_day UNIQUE (day_of_week),
    CONSTRAINT chk_working_hours_nonempty CHECK (open_time <> close_time)
);

INSERT INTO working_hours
    (id, day_of_week, open_time, close_time, active, created_at, updated_at, version)
VALUES
    ('00000000-0000-0000-0000-000000000101', 'MONDAY',    '09:00:00', '17:00:00', FALSE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 0),
    ('00000000-0000-0000-0000-000000000102', 'TUESDAY',   '09:00:00', '17:00:00', FALSE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 0),
    ('00000000-0000-0000-0000-000000000103', 'WEDNESDAY', '09:00:00', '17:00:00', FALSE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 0),
    ('00000000-0000-0000-0000-000000000104', 'THURSDAY',  '09:00:00', '17:00:00', FALSE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 0),
    ('00000000-0000-0000-0000-000000000105', 'FRIDAY',    '09:00:00', '17:00:00', FALSE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 0),
    ('00000000-0000-0000-0000-000000000106', 'SATURDAY',  '09:00:00', '17:00:00', FALSE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 0),
    ('00000000-0000-0000-0000-000000000107', 'SUNDAY',    '09:00:00', '17:00:00', FALSE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 0);

CREATE TABLE working_hours_exceptions (
    id CHAR(36) NOT NULL,
    exception_date DATE NOT NULL,
    description VARCHAR(500) NULL,
    full_day_closed BOOLEAN NOT NULL,
    override_open_time TIME NULL,
    override_close_time TIME NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_working_hours_exceptions PRIMARY KEY (id),
    CONSTRAINT uk_working_hours_exception_date UNIQUE (exception_date),
    CONSTRAINT chk_working_hours_exception_mode CHECK (
        (full_day_closed = TRUE AND override_open_time IS NULL AND override_close_time IS NULL)
        OR
        (full_day_closed = FALSE AND override_open_time IS NOT NULL
            AND override_close_time IS NOT NULL
            AND override_open_time <> override_close_time)
    )
);

CREATE INDEX idx_working_hours_exception_date
    ON working_hours_exceptions (exception_date);
