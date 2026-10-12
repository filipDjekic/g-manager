package com.game_manager.gm.audit;

import com.game_manager.gm.audit.dto.AuditEventResponse;
import com.game_manager.gm.audit.dto.AuditStatisticsResponse;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.Locale;
import java.util.stream.Stream;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuditService {
    private static final Set<String> SORTS = Set.of("createdAt", "action", "resourceType", "actorRole");
    private final AuditRepository repository;
    private final AuditAggregateRepository aggregates;
    private final CurrentUserProvider currentUserProvider;
    private final PageRequestFactory pageRequestFactory;
    private final GManagerProperties properties;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public PageResponse<AuditEventResponse> list(String action, String resourceType, UUID actorId,
            LocalDate from, LocalDate to, String search, int page, int size, String sort, String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Specification<AuditEvent> spec = filters(actor, action, resourceType, actorId, from, to, search);
        PageRequest requested = pageRequestFactory.create(page, size, sort, direction, SORTS);
        Sort stable = requested.getSort();
        if (stable.getOrderFor("createdAt") == null) stable = stable.and(Sort.by(Sort.Direction.DESC, "createdAt"));
        stable = stable.and(Sort.by(Sort.Direction.DESC, "id"));
        return PageResponse.from(repository.findAll(spec,
                PageRequest.of(requested.getPageNumber(), requested.getPageSize(), stable)).map(AuditEventResponse::from));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public AuditStatisticsResponse statistics(String action, String resourceType, UUID actorId,
            LocalDate from, LocalDate to, String search) {
        var counts = aggregates.countByAction(filters(currentUserProvider.requireCurrentUser(),
                action, resourceType, actorId, from, to, search));
        long total = 0, created = 0, updated = 0, removed = 0;
        for (var value : counts) {
            total += value.count();
            switch (AuditActionCategory.of(value.action())) {
                case CREATE -> created += value.count();
                case UPDATE -> updated += value.count();
                case DELETE, DEACTIVATE -> removed += value.count();
                case OTHER -> { }
            }
        }
        return new AuditStatisticsResponse(total, created, updated, removed,
                AuditActionCategory.CREATE.actions(), AuditActionCategory.UPDATE.actions(),
                Stream.concat(AuditActionCategory.DELETE.actions().stream(),
                        AuditActionCategory.DEACTIVATE.actions().stream()).sorted().toList());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public AuditEventResponse get(UUID id) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        AuditEvent event = repository.findOne(Specification.where(id(id)).and(visibleTo(actor.role())))
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Audit event not found"));
        return AuditEventResponse.from(event);
    }

    private Specification<AuditEvent> filters(AuthenticatedUser actor, String action, String resourceType,
            UUID actorId, LocalDate from, LocalDate to, String search) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Datum do ne može biti pre datuma od.");
        }
        return visibleTo(actor.role()).and(equal("action", bounded(action, 80)))
                .and(equal("resourceType", bounded(resourceType, 80))).and(equal("actorId", actorId))
                .and(from(from == null ? null : from.atStartOfDay(properties.businessZone()).toInstant()))
                .and(to(to == null ? null : to.plusDays(1).atStartOfDay(properties.businessZone()).toInstant()))
                .and(search(bounded(search, 160)));
    }

    private static String bounded(String value, int limit) {
        if (value == null) return null;
        if (value.length() > limit) throw new ApplicationException(HttpStatus.BAD_REQUEST, "Audit filter je predugačak.");
        return value.trim();
    }

    private static Specification<AuditEvent> search(String value) {
        if (value == null || value.isBlank()) return (root, query, cb) -> null;
        String escaped = value.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_");
        String pattern = "%" + escaped + "%";
        UUID identifier = value.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
                ? UUID.fromString(value) : null;
        return (root, query, cb) -> {
            var text = cb.or(cb.like(cb.lower(root.get("action")), pattern, '!'),
                    cb.like(cb.lower(root.get("resourceType")), pattern, '!'));
            return identifier == null ? text : cb.or(text, cb.equal(root.get("resourceId"), identifier),
                    cb.equal(root.get("actorId"), identifier));
        };
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
