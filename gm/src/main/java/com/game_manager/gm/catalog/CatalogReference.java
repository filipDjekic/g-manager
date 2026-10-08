package com.game_manager.gm.catalog;

import java.util.UUID;

public record CatalogReference(UUID id, String name, Integer durationMinutes, boolean requiresResource) {
    public CatalogReference(UUID id, String name, Integer durationMinutes) {
        this(id, name, durationMinutes, false);
    }
}
