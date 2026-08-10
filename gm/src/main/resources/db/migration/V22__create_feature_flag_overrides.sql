CREATE TABLE feature_flag_overrides (
 id CHAR(36) PRIMARY KEY,
 flag_key VARCHAR(60) NOT NULL,
 enabled BOOLEAN NOT NULL,
 rollout_percentage INT NOT NULL,
 expires_at TIMESTAMP(6),
 updated_by CHAR(36) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL,
 updated_at TIMESTAMP(6) NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT uk_feature_flag_key UNIQUE(flag_key),
 CONSTRAINT fk_feature_flag_updated_by FOREIGN KEY(updated_by) REFERENCES users(id),
 CONSTRAINT chk_feature_flag_rollout CHECK(rollout_percentage BETWEEN 0 AND 100)
);

CREATE INDEX idx_feature_flag_expiry ON feature_flag_overrides(expires_at);
