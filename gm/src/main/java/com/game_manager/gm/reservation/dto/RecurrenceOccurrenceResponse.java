package com.game_manager.gm.reservation.dto;

import java.time.Instant;
import java.util.UUID;

public record RecurrenceOccurrenceResponse(Instant startTime,Instant endTime,boolean available,String reason,
        UUID resourceId,String resourceCode,String resourceName,UUID locationId,String locationName) {
    public RecurrenceOccurrenceResponse(Instant startTime,Instant endTime,boolean available,String reason) {
        this(startTime,endTime,available,reason,null,null,null,null,null);
    }
}
