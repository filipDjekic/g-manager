package com.game_manager.gm.events;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.game_manager.gm.common.observability.SensitiveDataSanitizer;

@Repository
public class OutboxStore {
    private final JdbcTemplate jdbcTemplate;

    public OutboxStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public List<OutboxMessage> claim(String workerId, int limit, Instant now, Duration lease) {
        List<OutboxMessage> messages = jdbcTemplate.query("""
                SELECT id, event_type, schema_version, aggregate_type, aggregate_id,
                       occurred_at, correlation_id, payload, attempts
                FROM outbox_events
                WHERE (status = 'PENDING' AND available_at <= ?)
                   OR (status = 'PROCESSING' AND claimed_at < ?)
                ORDER BY created_at
                LIMIT ? FOR UPDATE SKIP LOCKED
                """, this::map, Timestamp.from(now), Timestamp.from(now.minus(lease)), limit);
        for (OutboxMessage message : messages) {
            jdbcTemplate.update("""
                    UPDATE outbox_events
                    SET status = 'PROCESSING', claimed_by = ?, claimed_at = ?, attempts = attempts + 1
                    WHERE id = ?
                    """, workerId, Timestamp.from(now), message.id().toString());
        }
        return messages;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean hasReceipt(String consumerName, UUID eventId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM outbox_consumer_receipts
                WHERE consumer_name = ? AND event_id = ?
                """, Integer.class, consumerName, eventId.toString());
        return count != null && count > 0;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void addReceipt(String consumerName, UUID eventId, Instant now) {
        jdbcTemplate.update("""
                INSERT INTO outbox_consumer_receipts (consumer_name, event_id, processed_at)
                VALUES (?, ?, ?)
                """, consumerName, eventId.toString(), Timestamp.from(now));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void markProcessed(UUID eventId, Instant now) {
        jdbcTemplate.update("""
                UPDATE outbox_events SET status = 'PROCESSED', processed_at = ?,
                    claimed_by = NULL, claimed_at = NULL, last_error = NULL WHERE id = ?
                """, Timestamp.from(now), eventId.toString());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void markFailed(UUID eventId, int attempt, int maxAttempts, Instant availableAt,
                           String error) {
        String status = attempt >= maxAttempts ? OutboxStatus.DEAD.name() : OutboxStatus.PENDING.name();
        jdbcTemplate.update("""
                UPDATE outbox_events SET status = ?, available_at = ?, claimed_by = NULL,
                    claimed_at = NULL, last_error = ? WHERE id = ?
                """, status, Timestamp.from(availableAt), abbreviate(error), eventId.toString());
    }

    public int replayDead(UUID eventId, Instant now) {
        return jdbcTemplate.update("""
                UPDATE outbox_events SET status = 'PENDING', attempts = 0, available_at = ?,
                    claimed_by = NULL, claimed_at = NULL, processed_at = NULL, last_error = NULL
                WHERE id = ? AND status = 'DEAD'
                """, Timestamp.from(now), eventId.toString());
    }

    public int deleteProcessedBefore(Instant cutoff) {
        jdbcTemplate.update("""
                DELETE FROM outbox_consumer_receipts WHERE event_id IN
                    (SELECT id FROM outbox_events WHERE status = 'PROCESSED' AND processed_at < ?)
                """, Timestamp.from(cutoff));
        return jdbcTemplate.update(
                "DELETE FROM outbox_events WHERE status = 'PROCESSED' AND processed_at < ?",
                Timestamp.from(cutoff));
    }

    public long count(OutboxStatus status) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM outbox_events WHERE status = ?",
                Long.class, status.name());
        return count == null ? 0 : count;
    }

    public long oldestPendingAgeSeconds(Instant now) {
        Timestamp oldest = jdbcTemplate.queryForObject("""
                SELECT MIN(created_at) FROM outbox_events WHERE status IN ('PENDING', 'PROCESSING')
                """, Timestamp.class);
        return oldest == null ? 0 : Math.max(0, Duration.between(oldest.toInstant(), now).toSeconds());
    }

    private OutboxMessage map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new OutboxMessage(
                UUID.fromString(resultSet.getString("id")), resultSet.getString("event_type"),
                resultSet.getInt("schema_version"), resultSet.getString("aggregate_type"),
                UUID.fromString(resultSet.getString("aggregate_id")),
                resultSet.getTimestamp("occurred_at").toInstant(),
                resultSet.getString("correlation_id"), resultSet.getString("payload"),
                resultSet.getInt("attempts") + 1);
    }

    private static String abbreviate(String value) {
        String safe = value == null || value.isBlank()
                ? "Consumer failed" : SensitiveDataSanitizer.redact(value);
        return safe.length() <= 500 ? safe : safe.substring(0, 500);
    }
}
