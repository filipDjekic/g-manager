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
}
