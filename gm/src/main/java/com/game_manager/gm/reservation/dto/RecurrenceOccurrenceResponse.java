package com.game_manager.gm.reservation.dto;
import java.time.Instant;
public record RecurrenceOccurrenceResponse(Instant startTime,Instant endTime,boolean available,String reason) {}
