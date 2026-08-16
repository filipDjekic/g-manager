package com.game_manager.gm.machine;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MachineProtocolRetentionJob {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final int nonceDays, heartbeatDays, auditDays;
    public MachineProtocolRetentionJob(JdbcTemplate jdbc, Clock clock,
            @Value("${app.gaming-client.retention.nonce-days:7}") int nonceDays,
            @Value("${app.gaming-client.retention.heartbeat-days:30}") int heartbeatDays,
            @Value("${app.gaming-client.retention.audit-days:90}") int auditDays) {
        this.jdbc=jdbc;this.clock=clock;this.nonceDays=nonceDays;this.heartbeatDays=heartbeatDays;this.auditDays=auditDays;
    }
    @Scheduled(cron="${app.gaming-client.retention.cleanup-cron:0 20 3 * * *}")
    @Transactional
    public void cleanup() {
        Instant now=clock.instant();
        jdbc.update("delete from station_auth_challenges where expires_at<?", Timestamp.from(now.minusSeconds(nonceDays*86400L)));
        jdbc.update("delete from station_enrollment_tokens where status<>'ACTIVE' and expires_at<?", Timestamp.from(now.minusSeconds(nonceDays*86400L)));
        jdbc.update("delete from station_heartbeats where last_seen_at<?", Timestamp.from(now.minusSeconds(heartbeatDays*86400L)));
        jdbc.update("delete from station_session_login_attempts where occurred_at<?", Timestamp.from(now.minusSeconds(auditDays*86400L)));
        jdbc.update("delete from station_reconciliation_audit where occurred_at<?", Timestamp.from(now.minusSeconds(auditDays*86400L)));
    }
}
