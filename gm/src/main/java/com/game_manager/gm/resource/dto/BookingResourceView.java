package com.game_manager.gm.resource.dto;

import com.game_manager.gm.resource.ResourceType;
import java.util.UUID;

public record BookingResourceView(UUID id, UUID serviceId, String code, String name,
        ResourceType type, UUID locationId, String locationName, boolean available) {}
