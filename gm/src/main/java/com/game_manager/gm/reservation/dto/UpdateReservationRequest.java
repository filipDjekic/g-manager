package com.game_manager.gm.reservation.dto;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;
public record UpdateReservationRequest(@NotNull @Min(0) Long version, Instant startTime,
        UUID resourceId, @Size(max=500) String note, @Min(1) Integer durationMinutes) {
 public UpdateReservationRequest(Long version,Instant startTime,UUID resourceId,String note){this(version,startTime,resourceId,note,null);}
}
