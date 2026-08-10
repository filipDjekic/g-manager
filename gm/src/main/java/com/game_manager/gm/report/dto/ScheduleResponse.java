package com.game_manager.gm.report.dto;
import com.game_manager.gm.report.*; import java.time.*; import java.util.UUID;
public record ScheduleResponse(UUID id,String definitionKey,ReportFormat format,String timezone,LocalTime localTime,Integer dayOfWeek,boolean active,Instant nextRunAt,long version){public static ScheduleResponse from(ReportSchedule s){return new ScheduleResponse(s.getId(),s.getDefinitionKey(),s.getFormat(),s.getTimezone(),s.getLocalTime(),s.getDayOfWeek(),s.isActive(),s.getNextRunAt(),s.getVersion());}}
