package com.gmanager.gmanager.catalog.dto;

import com.gmanager.gmanager.catalog.domain.CatalogItemType;

import java.math.BigDecimal;
import java.time.Instant;

public record CatalogItemResponse(
        Long id,
        String name,
        String description,
        CatalogItemType type,
        BigDecimal price,
        Integer durationMinutes,
        boolean active,
        Instant createdAt,
        Instant updatedAt
) {
}