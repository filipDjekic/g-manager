package com.game_manager.gm.reservation.dto;
import com.game_manager.gm.reservation.*;import jakarta.validation.constraints.*;import java.time.Instant;import java.util.UUID;
public record RecurrenceRequest(@NotNull UUID serviceId,@NotNull UUID employeeId,@NotNull Instant startTime,
 @NotNull RecurrenceFrequency frequency,@Min(1) @Max(4) int interval,@Min(2) @Max(20) int occurrences,
 @NotNull RecurrenceConflictPolicy conflictPolicy,@Size(max=500) String note,UUID resourceId,UUID locationId,UUID customerId,
 UUID areaId,@Min(1) Integer durationMinutes) {
 public RecurrenceRequest(UUID serviceId,UUID employeeId,Instant startTime,RecurrenceFrequency frequency,
  int interval,int occurrences,RecurrenceConflictPolicy conflictPolicy,String note,UUID resourceId,UUID locationId,UUID customerId){
  this(serviceId,employeeId,startTime,frequency,interval,occurrences,conflictPolicy,note,resourceId,locationId,customerId,null,null);
 }
 public RecurrenceRequest(UUID serviceId,UUID employeeId,Instant startTime,RecurrenceFrequency frequency,
  int interval,int occurrences,RecurrenceConflictPolicy conflictPolicy,String note,UUID resourceId,UUID locationId){
  this(serviceId,employeeId,startTime,frequency,interval,occurrences,conflictPolicy,note,resourceId,locationId,null);
 }
 public RecurrenceRequest(UUID serviceId,UUID employeeId,Instant startTime,RecurrenceFrequency frequency,
  int interval,int occurrences,RecurrenceConflictPolicy conflictPolicy,String note,UUID resourceId){
  this(serviceId,employeeId,startTime,frequency,interval,occurrences,conflictPolicy,note,resourceId,null,null);
 }
}
