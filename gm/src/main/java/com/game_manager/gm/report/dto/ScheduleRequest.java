package com.game_manager.gm.report.dto;
import com.game_manager.gm.report.ReportFormat; import jakarta.validation.constraints.*; import java.time.*;
public record ScheduleRequest(@NotBlank String definitionKey,@NotNull ReportFormat format,@NotNull Instant from,@NotNull Instant to,@NotBlank String timezone,@NotNull LocalTime localTime,@Min(1) @Max(7) Integer dayOfWeek){}
