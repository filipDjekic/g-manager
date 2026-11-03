package com.game_manager.gm.machine;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Operational machine signals, separate from backend readiness. No labels contain station, user or secret data. */
@Component("machineProtocol")
public class MachineProtocolObservability implements HealthIndicator {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final Duration offlineGrace;
    private final Duration commandLagWarning;
    private final AtomicLong activeSessions = new AtomicLong();
    private final AtomicLong offlineStations = new AtomicLong();
    private final AtomicLong lockPending = new AtomicLong();
    private final AtomicLong expiredUnacknowledged = new AtomicLong();
    private final AtomicLong unacknowledgedCommands = new AtomicLong();
    private final AtomicLong oldestCommandLagSeconds = new AtomicLong();
    private final AtomicLong clientFailures = new AtomicLong();
    private final AtomicLong updateFailures = new AtomicLong();
    private final Counter enrollmentFailures;
    private final Counter authenticationFailures;

    public MachineProtocolObservability(JdbcTemplate jdbc, MeterRegistry registry, Clock clock,
            @Value("${app.gaming-session.offline-grace-seconds:60}") long offlineGraceSeconds,
            @Value("${app.gaming-client.command-lag-warning-seconds:60}") long commandLagWarningSeconds) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.offlineGrace = Duration.ofSeconds(offlineGraceSeconds);
        this.commandLagWarning = Duration.ofSeconds(commandLagWarningSeconds);
        Gauge.builder("gmanager.machine.sessions.active", activeSessions, AtomicLong::get).register(registry);
        Gauge.builder("gmanager.machine.stations.offline", offlineStations, AtomicLong::get).register(registry);
        Gauge.builder("gmanager.machine.stations.lock.pending", lockPending, AtomicLong::get).register(registry);
        Gauge.builder("gmanager.machine.sessions.expired.unacknowledged", expiredUnacknowledged, AtomicLong::get).register(registry);
        Gauge.builder("gmanager.machine.commands.unacknowledged", unacknowledgedCommands, AtomicLong::get).register(registry);
        Gauge.builder("gmanager.machine.commands.oldest.lag.seconds", oldestCommandLagSeconds, AtomicLong::get).register(registry);
        Gauge.builder("gmanager.machine.clients.failed",clientFailures,AtomicLong::get).register(registry);
        Gauge.builder("gmanager.machine.updates.failed",updateFailures,AtomicLong::get).register(registry);
        enrollmentFailures = Counter.builder("gmanager.machine.enrollment.failures").register(registry);
        authenticationFailures = Counter.builder("gmanager.machine.authentication.failures").register(registry);
    }

    public void enrollmentFailed() { enrollmentFailures.increment(); }
    public void authenticationFailed() { authenticationFailures.increment(); }

    @Override public Health health() {
        try {
            refresh();
        } catch (DataAccessException exception) {
            return Health.down().withDetail("reason", "database-unavailable").build();
        }
        boolean delayed = oldestCommandLagSeconds.get() > commandLagWarning.toSeconds();
        boolean stationAttention = expiredUnacknowledged.get() > 0
                || lockPending.get() > 0 || offlineStations.get() > 0 || clientFailures.get()>0 || updateFailures.get()>0;
        // Station recovery needs a reachable API; operational warnings must not stop the backend.
        Health.Builder result = stationAttention || delayed ? Health.status("DEGRADED") : Health.up();
        return result.withDetail("activeSessions", activeSessions.get())
                .withDetail("offlineStations", offlineStations.get())
                .withDetail("lockPending", lockPending.get())
                .withDetail("expiredUnacknowledged", expiredUnacknowledged.get())
                .withDetail("unacknowledgedCommands", unacknowledgedCommands.get())
                .withDetail("clientFailures",clientFailures.get()).withDetail("updateFailures",updateFailures.get())
                .withDetail("oldestCommandLagSeconds", oldestCommandLagSeconds.get()).build();
    }

    @Scheduled(fixedDelayString="${app.gaming-client.metrics-refresh-millis:15000}")
    public synchronized void refresh() {
        Instant now = clock.instant();
        activeSessions.set(count("select count(*) from gaming_sessions where status='ACTIVE' and ends_at>?", now));
        lockPending.set(count("select count(*) from station_client_enforcement where enforcement_status='LOCK_PENDING'"));
        var heartbeats = jdbc.query("select h.last_seen_at,p.offline_grace_seconds from station_heartbeats h join gaming_station_profiles p on p.resource_id=h.station_id where p.client_enabled=true",
                (rs, row) -> instant(rs, "last_seen_at").plusSeconds(rs.getInt("offline_grace_seconds")));
        long neverSeen = count("select count(*) from gaming_station_profiles p left join station_heartbeats h on h.station_id=p.resource_id where p.client_enabled=true and h.station_id is null");
        offlineStations.set(neverSeen + heartbeats.stream().filter(value -> !value.isAfter(now)).count());
        jdbc.query("select count(*) as pending_count,min(available_at) as oldest from station_commands where acknowledged_at is null and expires_at>?",rs->{
            unacknowledgedCommands.set(rs.getLong("pending_count"));var oldest=rs.getTimestamp("oldest");
            oldestCommandLagSeconds.set(oldest==null?0:Math.max(0,Duration.between(oldest.toInstant(),now).toSeconds()));
        },now);
        clientFailures.set(count("select count(*) from station_heartbeats h join gaming_station_profiles p on p.resource_id=h.station_id where p.client_enabled=true and h.client_error_code is not null"));
        updateFailures.set(count("select count(*) from station_heartbeats h join gaming_station_profiles p on p.resource_id=h.station_id where p.client_enabled=true and h.update_status='FAILED'"));
        expiredUnacknowledged.set(count("select count(*) from gaming_sessions s join station_client_enforcement e on e.station_id=s.resource_id and e.session_id=s.id where s.status='EXPIRED' and e.enforcement_status<>'LOCKED'"));
    }

    private long count(String sql, Object... args) { Long value = jdbc.queryForObject(sql, Long.class, args); return value == null ? 0 : value; }
    private static Instant instant(ResultSet rs, String column) throws SQLException { return rs.getTimestamp(column).toInstant(); }
}
