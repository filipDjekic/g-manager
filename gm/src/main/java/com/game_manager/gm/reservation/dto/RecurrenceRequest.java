package com.game_manager.gm.reservation.dto;
import com.game_manager.gm.reservation.*;import jakarta.validation.constraints.*;import java.time.Instant;import java.util.UUID;
public record RecurrenceRequest(@NotNull UUID serviceId,@NotNull UUID employeeId,@NotNull Instant startTime,
 @NotNull RecurrenceFrequency frequency,@Min(1) @Max(4) int interval,@Min(2) @Max(20) int occurrences,
 @NotNull RecurrenceConflictPolicy conflictPolicy,@Size(max=500) String note) {}
