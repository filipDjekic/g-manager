package com.game_manager.gm.availability.dto;

import com.game_manager.gm.reservation.BookingSlotStatus;
import java.time.Instant;
import java.util.UUID;

public record AvailabilitySlotResponse(Instant startTime,Instant endTime,UUID resourceId,
        String resourceCode,String resourceName,UUID locationId,String locationName,BookingSlotStatus status,String reason) {
    public AvailabilitySlotResponse(Instant startTime,Instant endTime,UUID resourceId,String resourceCode,String resourceName,UUID locationId,String locationName) {
        this(startTime,endTime,resourceId,resourceCode,resourceName,locationId,locationName,BookingSlotStatus.AVAILABLE,null);
    }
    public AvailabilitySlotResponse(Instant startTime,Instant endTime) {this(startTime,endTime,null,null,null,null,null);}
}
