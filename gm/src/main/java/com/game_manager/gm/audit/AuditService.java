package com.game_manager.gm.audit;

import com.game_manager.gm.audit.dto.AuditEventResponse;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuditService {
    private static final Set<String> SORTS = Set.of("createdAt", "action", "resourceType", "actorRole");
    private final AuditRepository repository;
    private final CurrentUserProvider currentUserProvider;
    private final PageRequestFactory pageRequestFactory;
    private final GManagerProperties properties;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public PageResponse<AuditEventResponse> list(String action, String resourceType, UUID actorId,
            LocalDate from, LocalDate to, int page, int size, String sort, String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Specification<AuditEvent> spec = visibleTo(actor.role())
                .and(equal("action", action)).and(equal("resourceType", resourceType))
                .and(equal("actorId", actorId))
                .and(from(from == null ? null : from.atStartOfDay(properties.businessZone()).toInstant()))
                .and(to(to == null ? null : to.plusDays(1).atStartOfDay(properties.businessZone()).toInstant()));
        return PageResponse.from(repository.findAll(spec,
                pageRequestFactory.create(page, size, sort, direction, SORTS)).map(AuditEventResponse::from));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public AuditEventResponse get(UUID id) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        AuditEvent event = repository.findOne(Specification.where(id(id)).and(visibleTo(actor.role())))
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Audit event not found"));
        return AuditEventResponse.from(event);
    }

    private static Specification<AuditEvent> visibleTo(Role role) {
        return (root, query, cb) -> role == Role.OWNER ? cb.conjunction()
                : cb.equal(root.get("visibility"), AuditVisibility.MANAGEMENT);
    }
    private static Specification<AuditEvent> equal(String field, Object value) {
        return (root, query, cb) -> value == null || value.toString().isBlank() ? null : cb.equal(root.get(field), value);
    }
    private static Specification<AuditEvent> from(Instant value) {
        return (root, query, cb) -> value == null ? null : cb.greaterThanOrEqualTo(root.get("createdAt"), value);
    }
    private static Specification<AuditEvent> to(Instant value) {
        return (root, query, cb) -> value == null ? null : cb.lessThan(root.get("createdAt"), value);
    }
    private static Specification<AuditEvent> id(UUID value) {
        return (root, query, cb) -> cb.equal(root.get("id"), value);
    }
}
