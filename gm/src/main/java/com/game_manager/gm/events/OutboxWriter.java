package com.game_manager.gm.events;

import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OutboxWriter {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public OutboxWriter(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public UUID write(DomainEventType type, String aggregateType, UUID aggregateId,
                      Map<String, Object> payload) {
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        String requestId = MDC.get("requestId");
        String correlationId = requestId == null || requestId.isBlank() ? id.toString() : requestId;
        DomainEvent event = new DomainEvent(
                id, type, 1, aggregateType, aggregateId, now, correlationId, payload);
        jdbcTemplate.update("""
                INSERT INTO outbox_events
                (id, event_type, schema_version, aggregate_type, aggregate_id, occurred_at,
                 correlation_id, payload, status, attempts, available_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
                """, id.toString(), type.name(), event.schemaVersion(), aggregateType,
                aggregateId.toString(), Timestamp.from(now), correlationId, serialize(event),
                Timestamp.from(now), Timestamp.from(now));
        return id;
    }

    private String serialize(DomainEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Domain event could not be serialized", exception);
        }
    }
}
