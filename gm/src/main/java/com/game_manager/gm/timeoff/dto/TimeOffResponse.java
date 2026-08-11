package com.game_manager.gm.timeoff.dto;
import com.game_manager.gm.timeoff.*; import java.time.Instant; import java.util.UUID;
public record TimeOffResponse(UUID id,UUID employeeId,Instant startsAt,Instant endsAt,TimeOffStatus status,String reason,String decisionReason,long version){public static TimeOffResponse from(EmployeeTimeOff v){return new TimeOffResponse(v.getId(),v.getEmployeeId(),v.getStartsAt(),v.getEndsAt(),v.getStatus(),v.getReason(),v.getDecisionReason(),v.getVersion());}}
