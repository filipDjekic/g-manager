package com.game_manager.gm.reservation.dto;
import java.util.*;
public record RecurrenceCreateResponse(UUID seriesId,List<ReservationResponse> created,List<RecurrenceOccurrenceResponse> skipped) {}
