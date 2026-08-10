package com.game_manager.gm.reservation;

import java.time.Instant;
import java.util.UUID;
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

    private static UUID parseUuid(String value) {
        try { return UUID.fromString(value.trim()); } catch (IllegalArgumentException exception) { return null; }
    }
    private static ReservationStatus parseStatus(String value) {
        try { return ReservationStatus.valueOf(value.trim().toUpperCase(java.util.Locale.ROOT)); }
        catch (IllegalArgumentException exception) { return null; }
    }
}
