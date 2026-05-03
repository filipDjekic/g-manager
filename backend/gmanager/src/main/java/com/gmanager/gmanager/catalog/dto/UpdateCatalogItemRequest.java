package com.gmanager.gmanager.catalog.dto;

import com.gmanager.gmanager.catalog.domain.CatalogItemType;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record UpdateCatalogItemRequest(

        @NotBlank(message = "Name is required")
        @Size(min = 2, max = 160, message = "Name must be between 2 and 160 characters")
        String name,

        @Size(max = 5000, message = "Description must not exceed 5000 characters")
        String description,

        @NotNull(message = "Type is required")
        CatalogItemType type,

        @NotNull(message = "Price is required")
        @DecimalMin(value = "0.01", message = "Price must be greater than zero")
        @Digits(integer = 10, fraction = 2, message = "Price must have max 10 integer digits and 2 decimals")
        BigDecimal price,

        @Min(value = 1, message = "Duration must be at least 1 minute")
        @Max(value = 1440, message = "Duration must not exceed 1440 minutes")
        Integer durationMinutes
) {
}