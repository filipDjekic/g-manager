package com.game_manager.gm.availability.dto;

import java.time.Instant;
import java.util.UUID;

public record AvailabilitySlotResponse(Instant startTime, Instant endTime, UUID resourceId,
        String resourceCode, String resourceName, UUID locationId, String locationName) {
    public AvailabilitySlotResponse(Instant startTime, Instant endTime) {
        this(startTime,endTime,null,null,null,null,null);
    }
}
