package com.game_manager.gm.jobs;

import com.game_manager.gm.common.config.GManagerProperties;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AuditCleanupJobHandler implements JobHandler {
    private final JdbcTemplate jdbcTemplate;
    private final GManagerProperties.Jobs properties;
    private final Clock clock;

    public AuditCleanupJobHandler(
            JdbcTemplate jdbcTemplate, GManagerProperties properties, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties.jobs();
        this.clock = clock;
    }

    @Override
    public String type() {
        return CleanupJobTypes.AUDIT;
    }

    @Override
    public void handle(JobRecord job, JobContext context) {
        context.checkCancellation();
        jdbcTemplate.update("DELETE FROM audit_events WHERE created_at < ?", Timestamp.from(
                clock.instant().minus(properties.auditRetentionDays(), ChronoUnit.DAYS)));
    }
}
