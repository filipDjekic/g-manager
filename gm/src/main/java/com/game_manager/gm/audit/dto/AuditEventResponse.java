package com.game_manager.gm.audit.dto;

import com.game_manager.gm.audit.AuditEvent;
import com.game_manager.gm.common.security.Role;
import java.time.Instant;
import java.util.UUID;

public record AuditEventResponse(UUID id, UUID actorId, Role actorRole, String action,
        String resourceType, UUID resourceId, String beforeData, String afterData,
        String reason, Instant occurredAt) {
    public static AuditEventResponse from(AuditEvent event) {
        return new AuditEventResponse(event.getId(), event.getActorId(), event.getActorRole(),
                event.getAction(), event.getResourceType(), event.getResourceId(),
                event.getBeforeData(), event.getAfterData(), event.getReason(), event.getCreatedAt());
    }
}
