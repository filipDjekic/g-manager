package com.game_manager.gm.resource.dto;

import com.game_manager.gm.resource.ResourceType;
import java.util.UUID;

public record ResourceSearchReference(UUID id, UUID areaId, UUID locationId, String name, String code, ResourceType type) {}
