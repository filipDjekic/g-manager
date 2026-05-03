package com.gmanager.gmanager.catalog.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateCatalogItemStatusRequest(

        @NotNull(message = "Active is required")
        Boolean active
) {
}