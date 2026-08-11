package com.game_manager.gm.catalog;

import java.util.UUID;

public record CatalogReference(UUID id, String name, Integer durationMinutes) {}
