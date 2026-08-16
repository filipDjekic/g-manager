ALTER TABLE application_definitions ADD COLUMN publisher_certificate_thumbprint VARCHAR(64) NULL;
ALTER TABLE application_definitions ADD COLUMN minimum_file_version VARCHAR(50) NULL;
ALTER TABLE application_profile_entries ADD COLUMN dependency_group VARCHAR(60) NULL;
CREATE INDEX idx_application_profile_dependency_group ON application_profile_entries (profile_id,dependency_group,launch_order);
