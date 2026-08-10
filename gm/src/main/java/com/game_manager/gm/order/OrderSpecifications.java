package com.game_manager.gm.order;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;

public final class OrderSpecifications {
    private OrderSpecifications() {}

    public static Specification<Order> hasCustomer(UUID customerId) {
        return (root, query, builder) -> customerId == null
                ? null : builder.equal(root.get("customerId"), customerId);
    }

    public static Specification<Order> hasHandler(UUID handledBy) {
        return (root, query, builder) -> handledBy == null
                ? null : builder.equal(root.get("handledBy"), handledBy);
    }

    public static Specification<Order> hasStatus(OrderStatus status) {
        return (root, query, builder) -> status == null
                ? null : builder.equal(root.get("status"), status);
    }

    public static Specification<Order> createdFrom(Instant from) {
        return (root, query, builder) -> from == null
                ? null : builder.greaterThanOrEqualTo(root.get("createdAt"), from);
    }

    public static Specification<Order> createdBefore(Instant to) {
        return (root, query, builder) -> to == null
                ? null : builder.lessThan(root.get("createdAt"), to);
    }

    public static Specification<Order> matchesSearch(String query) {
        UUID id = parseUuid(query);
        OrderStatus status = parseStatus(query);
        return (root, ignored, builder) -> {
            if (id == null && status == null) return builder.disjunction();
            if (id != null && status != null) return builder.or(builder.equal(root.get("id"), id), builder.equal(root.get("status"), status));
            return id != null ? builder.equal(root.get("id"), id) : builder.equal(root.get("status"), status);
        };
    }

    private static UUID parseUuid(String value) {
        try { return UUID.fromString(value.trim()); } catch (IllegalArgumentException exception) { return null; }
    }
    private static OrderStatus parseStatus(String value) {
        try { return OrderStatus.valueOf(value.trim().toUpperCase(java.util.Locale.ROOT)); }
        catch (IllegalArgumentException exception) { return null; }
    }
}
