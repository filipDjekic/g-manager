package com.game_manager.gm.gamingsession.command;

import com.game_manager.gm.gamingsession.GamingSession;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;
import tools.jackson.databind.ObjectMapper;

@Service
public class StationCommandWriter {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;
    private final Duration retention;
    private final com.game_manager.gm.machine.StationEnforcementProjectionService enforcement;

    public StationCommandWriter(JdbcTemplate jdbc, ObjectMapper json, Clock clock,
            @Value("${app.gaming-session.command-retention-days:30}") long retentionDays,
            com.game_manager.gm.machine.StationEnforcementProjectionService enforcement) {
        this.jdbc = jdbc; this.json = json; this.clock = clock; this.retention = Duration.ofDays(retentionDays);this.enforcement=enforcement;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public long write(GamingSession session, StationCommandType type) {
        Instant now = clock.instant(); ensureCursor(session.getResourceId(), now);
        Long current = jdbc.queryForObject("SELECT last_sequence FROM station_command_sequences WHERE station_id=? FOR UPDATE",
                Long.class, session.getResourceId().toString());
        long sequence = Objects.requireNonNull(current) + 1;
        jdbc.update("UPDATE station_command_sequences SET last_sequence=?,updated_at=? WHERE station_id=?",
                sequence, Timestamp.from(now), session.getResourceId().toString());
        UUID id = UUID.randomUUID(); String correlation = MDC.get("requestId");
        if (correlation == null || correlation.isBlank()) correlation = id.toString();
        Map<String,Object> payload = new LinkedHashMap<>();
        payload.put("sessionId", session.getId()); payload.put("stationId", session.getResourceId());
        payload.put("customerId", session.getCustomerId()); payload.put("status", session.getStatus());
        payload.put("startedAt", session.getStartedAt()); payload.put("endsAt", session.getEndsAt());
        payload.put("endedAt", session.getEndedAt());
        jdbc.update("""
                INSERT INTO station_commands
                (id,station_id,session_id,sequence,command_type,payload_version,payload,correlation_id,
                 available_at,acknowledged_at,expires_at,created_at,updated_at,version)
                VALUES (?,?,?,?,?,1,?,?,?,NULL,?,?,?,0)
                """, id.toString(), session.getResourceId().toString(), session.getId().toString(), sequence,
                type.name(), json.writeValueAsString(payload), correlation, Timestamp.from(now),
                Timestamp.from(now.plus(retention)), Timestamp.from(now), Timestamp.from(now));
        session.setLastCommandSequence(sequence);
        enforcement.commandIssued(session,type,sequence);
        return sequence;
    }

    public boolean matchesCurrentProjection(GamingSession session) {
        if (session.getLastCommandSequence() == null) return false;
        List<Map<String,Object>> rows = jdbc.queryForList("""
                SELECT command_type,payload FROM station_commands
                WHERE station_id=? AND sequence=? AND session_id=?
                """, session.getResourceId().toString(), session.getLastCommandSequence(), session.getId().toString());
        if (rows.size() != 1) return false;
        Map<String,Object> row = rows.getFirst();
        String actualType = String.valueOf(row.get("command_type"));
        if (session.getStatus().name().equals("ACTIVE")
                ? !(actualType.equals(StationCommandType.SESSION_STARTED.name())
                    || actualType.equals(StationCommandType.SESSION_EXTENDED.name()))
                : !(actualType.equals(StationCommandType.SESSION_TERMINATED.name())
                    || actualType.equals(StationCommandType.FORCE_LOCK.name()))) return false;
        var payload = json.readTree(String.valueOf(row.get("payload")));
        String projectedEndedAt = payload.path("endedAt").isNull() ? null : payload.path("endedAt").asText();
        return session.getEndsAt().toString().equals(payload.path("endsAt").asText())
                && session.getStatus().name().equals(payload.path("status").asText())
                && Objects.equals(session.getEndedAt() == null ? null : session.getEndedAt().toString(), projectedEndedAt);
    }

    private void ensureCursor(UUID stationId, Instant now) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM station_command_sequences WHERE station_id=?",
                Integer.class, stationId.toString());
        if (count != null && count == 0) jdbc.update("INSERT INTO station_command_sequences (station_id,last_sequence,updated_at) VALUES (?,0,?)",
                stationId.toString(), Timestamp.from(now));
    }
}
