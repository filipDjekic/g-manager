package com.game_manager.gm.catalog.dto;

import com.game_manager.gm.catalog.ItemType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record CreateCatalogItemRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 2000) String description,
        @NotNull ItemType type,
        @NotNull @DecimalMin(value = "0.00", inclusive = false)
        @Digits(integer = 10, fraction = 2) BigDecimal price,
        @Positive Integer durationMinutes
) {
}
