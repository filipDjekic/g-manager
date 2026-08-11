package com.game_manager.gm.reservation.dto;
import java.util.List;
public record RecurrencePreviewResponse(String timezone,List<RecurrenceOccurrenceResponse> occurrences) {}
