package com.game_manager.gm.catalog;

import java.math.BigDecimal;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

public final class CatalogSpecifications {
    private CatalogSpecifications() {
    }

    public static Specification<CatalogItem> hasType(ItemType type) {
        return (root, query, builder) ->
                type == null ? null : builder.equal(root.get("type"), type);
    }

    public static Specification<CatalogItem> isActive(Boolean active) {
        return (root, query, builder) ->
                active == null ? null : builder.equal(root.get("active"), active);
    }

    public static Specification<CatalogItem> nameContains(String search) {
        return (root, query, builder) -> search == null || search.isBlank()
                ? null
                : builder.like(
                        builder.lower(root.get("name")),
                        "%" + search.trim().toLowerCase(Locale.ROOT) + "%");
    }

    public static Specification<CatalogItem> priceBetween(BigDecimal minPrice, BigDecimal maxPrice) {
        return (root, query, builder) -> {
            if (minPrice == null && maxPrice == null) {
                return null;
            }
            if (minPrice != null && maxPrice != null) {
                return builder.between(root.get("price"), minPrice, maxPrice);
            }
            return minPrice != null
                    ? builder.greaterThanOrEqualTo(root.get("price"), minPrice)
                    : builder.lessThanOrEqualTo(root.get("price"), maxPrice);
        };
    }

    public static Specification<CatalogItem> notDeleted() {
        return (root, query, builder) -> builder.isNull(root.get("deletedAt"));
    }

    public static Specification<CatalogItem> deleted() {
        return (root, query, builder) -> builder.isNotNull(root.get("deletedAt"));
    }
}
