package com.game_manager.gm.order;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;
import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;

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

    public static Specification<Order> managementSearch(String search, boolean customerVisible,
            boolean productVisible, boolean activeProductsOnly) {
        return (root, query, builder) -> {
            if (search == null || search.isBlank()) return null;
            String value = search.trim().toLowerCase(java.util.Locale.ROOT);
            String textPattern = literalPattern(value);
            String idValue = value.startsWith("#") ? value.substring(1) : value;
            var match = idValue.isBlank() ? builder.disjunction()
                    : builder.like(builder.lower(root.get("id").as(String.class)), literalPattern(idValue), '\\');
            if (customerVisible) {
                var customerQuery = query.subquery(Integer.class);
                var customer = customerQuery.from(User.class);
                customerQuery.select(builder.literal(1)).where(
                        builder.equal(customer.get("id"), root.get("customerId")),
                        builder.equal(customer.get("role"), Role.CUSTOMER),
                        builder.isNull(customer.get("deletedAt")),
                        builder.or(builder.like(builder.lower(customer.get("name")), textPattern, '\\'),
                                builder.like(builder.lower(customer.get("email")), textPattern, '\\')));
                match = builder.or(match, builder.exists(customerQuery));
            }
            if (productVisible) {
                var productQuery = query.subquery(Integer.class);
                var item = productQuery.from(OrderItem.class);
                var product = productQuery.from(CatalogItem.class);
                productQuery.select(builder.literal(1)).where(
                        builder.equal(item.get("order").get("id"), root.get("id")),
                        builder.equal(item.get("productId"), product.get("id")),
                        builder.equal(product.get("type"), ItemType.PRODUCT),
                        builder.isNull(product.get("deletedAt")),
                        activeProductsOnly ? builder.isTrue(product.get("active")) : builder.conjunction(),
                        builder.like(builder.lower(product.get("name")), textPattern, '\\'));
                match = builder.or(match, builder.exists(productQuery));
            }
            return match;
        };
    }

    private static String literalPattern(String value) {
        return "%" + value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
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
