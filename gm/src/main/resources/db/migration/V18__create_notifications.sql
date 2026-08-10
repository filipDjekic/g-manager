CREATE TABLE notification_templates (
    id CHAR(36) NOT NULL, type VARCHAR(80) NOT NULL, locale VARCHAR(10) NOT NULL,
    title_template VARCHAR(180) NOT NULL, body_template VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id), CONSTRAINT uk_notification_template_type_locale UNIQUE (type, locale)
);
CREATE TABLE notification_preferences (
    id CHAR(36) NOT NULL, recipient_id CHAR(36) NOT NULL, type VARCHAR(80) NOT NULL,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE, email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id), CONSTRAINT uk_notification_preference_recipient_type UNIQUE (recipient_id, type),
    CONSTRAINT fk_notification_preference_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE notifications (
    id CHAR(36) NOT NULL, source_event_id CHAR(36) NOT NULL, recipient_id CHAR(36) NOT NULL,
    type VARCHAR(80) NOT NULL, priority VARCHAR(20) NOT NULL, title VARCHAR(180) NOT NULL,
    body VARCHAR(1000) NOT NULL, resource_type VARCHAR(30) NULL, resource_id CHAR(36) NULL,
    deep_link VARCHAR(500) NOT NULL, in_app_visible BOOLEAN NOT NULL DEFAULT TRUE, read_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id), CONSTRAINT uk_notification_event_recipient_type UNIQUE (source_event_id, recipient_id, type),
    CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_notification_recipient_created ON notifications(recipient_id, created_at, id);
CREATE INDEX idx_notification_recipient_read ON notifications(recipient_id, read_at, created_at);
CREATE TABLE notification_delivery_attempts (
    id CHAR(36) NOT NULL, notification_id CHAR(36) NOT NULL, channel VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL, attempts INT NOT NULL DEFAULT 0, available_at TIMESTAMP(6) NOT NULL,
    delivered_at TIMESTAMP(6) NULL, last_error VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL, updated_at TIMESTAMP(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id), CONSTRAINT uk_notification_delivery_channel UNIQUE (notification_id, channel),
    CONSTRAINT fk_notification_delivery_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
);
CREATE INDEX idx_notification_delivery_claim ON notification_delivery_attempts(status, available_at, created_at);

INSERT INTO notification_templates (id, type, locale, title_template, body_template, created_at, updated_at, version) VALUES
('00000000-0000-0000-0000-000000000201','SECURITY_SESSION_STARTED','sr','Nova prijava','Zabeležena je nova prijava na vaš nalog.',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6),0),
('00000000-0000-0000-0000-000000000202','SECURITY_PASSWORD_CHANGED','sr','Lozinka je promenjena','Lozinka vašeg naloga je uspešno promenjena.',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6),0),
('00000000-0000-0000-0000-000000000203','RESERVATION_CREATED','sr','Novi zahtev za termin','Dodeljen vam je novi zahtev za termin.',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6),0),
('00000000-0000-0000-0000-000000000204','RESERVATION_STATUS_CHANGED','sr','Promenjen status termina','Status termina je promenjen na {{status}}.',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6),0),
('00000000-0000-0000-0000-000000000205','ORDER_CREATED','sr','Narudžbina je kreirana','Vaša narudžbina je uspešno kreirana.',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6),0),
('00000000-0000-0000-0000-000000000206','ORDER_STATUS_CHANGED','sr','Promenjen status narudžbine','Status narudžbine je promenjen na {{status}}.',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6),0);
