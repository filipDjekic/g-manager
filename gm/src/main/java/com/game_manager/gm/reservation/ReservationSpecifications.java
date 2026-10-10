package com.game_manager.gm.reservation;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.resource.Location;
import com.game_manager.gm.resource.PhysicalResource;
import com.game_manager.gm.user.User;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

public final class ReservationSpecifications {
    private ReservationSpecifications() {
    }

    public static Specification<Reservation> hasCustomer(UUID customerId) {
        return (root, query, builder) -> customerId == null
                ? null : builder.equal(root.get("customerId"), customerId);
    }

    public static Specification<Reservation> hasEmployee(UUID employeeId) {
        return (root, query, builder) -> employeeId == null
                ? null : builder.equal(root.get("employeeId"), employeeId);
    }

    public static Specification<Reservation> hasResource(UUID resourceId) {
        return (root,query,builder) -> resourceId==null ? null : builder.equal(root.get("resourceId"),resourceId);
    }
    public static Specification<Reservation> hasLocation(UUID locationId) {
        return (root,query,builder) -> locationId==null ? null : builder.equal(root.get("locationId"),locationId);
    }
    public static Specification<Reservation> inResources(java.util.Set<UUID> ids) {
        return (root,query,builder) -> ids.isEmpty() ? builder.disjunction() : root.get("resourceId").in(ids);
    }
    public static Specification<Reservation> hasStatus(ReservationStatus status) {
        return (root, query, builder) -> status == null
                ? null : builder.equal(root.get("status"), status);
    }

    public static Specification<Reservation> startsFrom(Instant from) {
        return (root, query, builder) -> from == null
                ? null : builder.greaterThanOrEqualTo(root.get("startTime"), from);
    }

    public static Specification<Reservation> startsBefore(Instant toExclusive) {
        return (root, query, builder) -> toExclusive == null
                ? null : builder.lessThan(root.get("startTime"), toExclusive);
    }

    public static Specification<Reservation> matchesSearch(String query) {
        UUID id = parseUuid(query);
        ReservationStatus status = parseStatus(query);
        return (root, ignored, builder) -> {
            if (id == null && status == null) return builder.disjunction();
            if (id != null && status != null) return builder.or(builder.equal(root.get("id"), id), builder.equal(root.get("status"), status));
            return id != null ? builder.equal(root.get("id"), id) : builder.equal(root.get("status"), status);
        };
    }

    /** Search visible fields without making masked customer names or notes searchable. */
    public static Specification<Reservation> matchesText(String text, Set<UUID> customerVisibleResources) {
        if (text == null || text.isBlank()) return (root, query, builder) -> builder.conjunction();
        String term = text.trim();
        String pattern = "%" + term.toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                .replace("%", "\\%").replace("_", "\\_") + "%";
        UUID id = parseUuid(term);
        ReservationStatus status = parseStatus(term);
        return (root, query, builder) -> {
            var users = query.subquery(UUID.class);
            var user = users.from(User.class);
            users.select(user.get("id")).where(builder.like(builder.lower(user.get("name")), pattern, '\\'));
            var services = query.subquery(UUID.class);
            var service = services.from(CatalogItem.class);
            services.select(service.get("id")).where(builder.like(builder.lower(service.get("name")), pattern, '\\'));
            var resources = query.subquery(UUID.class);
            var resource = resources.from(PhysicalResource.class);
            resources.select(resource.get("id")).where(builder.or(
                    builder.like(builder.lower(resource.get("name")), pattern, '\\'),
                    builder.like(builder.lower(resource.get("code")), pattern, '\\')));
            var locations = query.subquery(UUID.class);
            var location = locations.from(Location.class);
            locations.select(location.get("id")).where(builder.like(builder.lower(location.get("name")), pattern, '\\'));
            Predicate customerVisible = customerVisibleResources == null ? builder.conjunction()
                    : customerVisibleResources.isEmpty() ? builder.disjunction()
                    : root.get("resourceId").in(customerVisibleResources);
            var matches = new ArrayList<Predicate>();
            matches.add(root.get("serviceId").in(services));
            matches.add(root.get("resourceId").in(resources));
            matches.add(root.get("locationId").in(locations));
            matches.add(root.get("employeeId").in(users));
            matches.add(builder.and(customerVisible, root.get("customerId").in(users)));
            matches.add(builder.and(customerVisible, builder.like(builder.lower(root.get("note")), pattern, '\\')));
            if (id != null) matches.add(builder.equal(root.get("id"), id));
            if (status != null) matches.add(builder.equal(root.get("status"), status));
            return builder.or(matches.toArray(Predicate[]::new));
        };
    }

    private static UUID parseUuid(String value) {
        try { return UUID.fromString(value.trim()); } catch (IllegalArgumentException exception) { return null; }
    }
    private static ReservationStatus parseStatus(String value) {
        try { return ReservationStatus.valueOf(value.trim().toUpperCase(java.util.Locale.ROOT)); }
        catch (IllegalArgumentException exception) { return null; }
    }
}
