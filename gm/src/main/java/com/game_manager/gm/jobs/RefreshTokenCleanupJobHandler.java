package com.game_manager.gm.jobs;

import com.game_manager.gm.common.config.GManagerProperties;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class RefreshTokenCleanupJobHandler implements JobHandler {
    private final JdbcTemplate jdbcTemplate;
    private final GManagerProperties.Jobs properties;
    private final Clock clock;

    public RefreshTokenCleanupJobHandler(
            JdbcTemplate jdbcTemplate, GManagerProperties properties, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties.jobs();
        this.clock = clock;
    }

    @Override
    public String type() {
        return CleanupJobTypes.REFRESH_TOKENS;
    }

    @Override
    public void handle(JobRecord job, JobContext context) {
        context.checkCancellation();
        jdbcTemplate.update("""
                DELETE FROM refresh_tokens
                WHERE expires_at < ? OR (revoked = TRUE AND updated_at < ?)
                """, Timestamp.from(clock.instant()), Timestamp.from(clock.instant().minus(
                properties.refreshTokenRetentionDays(), ChronoUnit.DAYS)));
    }
}
