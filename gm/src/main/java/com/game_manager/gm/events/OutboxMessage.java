package com.game_manager.gm.events;

import java.time.Instant;
import java.util.UUID;

public record OutboxMessage(
        UUID id,
        String eventType,
        int schemaVersion,
        String aggregateType,
        UUID aggregateId,
        Instant occurredAt,
        String correlationId,
        String payload,
        int attempts
) {
}
