package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.reservation.RecurrenceConflictPolicy;
import java.util.List;

public record RecurrencePreviewResponse(String timezone,List<RecurrenceOccurrenceResponse> occurrences,
        long availableCount,long conflictCount,long reservationsToCreate) {
    public RecurrencePreviewResponse(String timezone,List<RecurrenceOccurrenceResponse> occurrences,RecurrenceConflictPolicy policy) {
        this(timezone,occurrences,occurrences.stream().filter(RecurrenceOccurrenceResponse::available).count(),
                occurrences.stream().filter(o->!o.available()).count(),
                policy==RecurrenceConflictPolicy.ALL_OR_NOTHING&&occurrences.stream().anyMatch(o->!o.available())
                        ?0:occurrences.stream().filter(RecurrenceOccurrenceResponse::available).count());
    }
    public RecurrencePreviewResponse(String timezone,List<RecurrenceOccurrenceResponse> occurrences) {
        this(timezone,occurrences,RecurrenceConflictPolicy.ALL_OR_NOTHING);
    }
}
