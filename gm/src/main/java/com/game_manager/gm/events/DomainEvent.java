package com.game_manager.gm.events;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record DomainEvent(
        UUID id,
        DomainEventType type,
        int schemaVersion,
        String aggregateType,
        UUID aggregateId,
        Instant occurredAt,
        String correlationId,
        Map<String, Object> payload
) {
    public DomainEvent {
        payload = Map.copyOf(payload);
    }
}
