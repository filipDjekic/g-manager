package com.game_manager.gm.catalog.dto;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.ItemType;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record CatalogItemResponse(
        UUID id,
        String name,
        String description,
        ItemType type,
        BigDecimal price,
        Integer durationMinutes,
        boolean active,
        String imageUrl,
        Instant createdAt,
        Instant updatedAt,
        Long version,
        Instant deletedAt,
        UUID deletedBy,
        String deletionReason
) {
    public static CatalogItemResponse from(CatalogItem item) {
        return new CatalogItemResponse(
                item.getId(), item.getName(), item.getDescription(), item.getType(), item.getPrice(),
                item.getDurationMinutes(), item.isActive(), item.getImageUrl(),
                item.getCreatedAt(), item.getUpdatedAt(), item.getVersion(), item.getDeletedAt(),
                item.getDeletedBy(), item.getDeletionReason());
    }
}
