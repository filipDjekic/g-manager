package com.game_manager.gm.audit;

import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuditWriter {
    private final AuditRepository repository;
    private final CurrentUserProvider currentUserProvider;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;

    public void write(String action, String resourceType, UUID resourceId,
                      Map<String, ?> before, Map<String, ?> after, String reason,
                      AuditVisibility visibility) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        writeAttributed(actor.id(), actor.role(), action, resourceType, resourceId, before, after, reason, visibility);
    }

    /** Server lifecycle events retain the initiating employee even without a web-user security context. */
    public void writeAttributed(UUID actorId, com.game_manager.gm.common.security.Role actorRole,
                      String action, String resourceType, UUID resourceId,
                      Map<String, ?> before, Map<String, ?> after, String reason, AuditVisibility visibility) {
        try {
            repository.saveAndFlush(new AuditEvent(actorId, actorRole, action, resourceType,
                    resourceId, json(before), json(after), normalize(reason), visibility));
            meterRegistry.counter("audit.writes", "result", "success").increment();
        } catch (RuntimeException exception) {
            meterRegistry.counter("audit.writes", "result", "failure").increment();
            throw exception;
        }
    }

    private String json(Map<String, ?> value) {
        return value == null || value.isEmpty() ? null : objectMapper.writeValueAsString(value);
    }

    private String normalize(String reason) {
        return reason == null || reason.isBlank() ? null : reason.trim();
    }
}
