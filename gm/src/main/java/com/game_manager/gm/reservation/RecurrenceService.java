package com.game_manager.gm.reservation;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.reservation.dto.*;
import com.game_manager.gm.user.UserService;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class RecurrenceService {
 private static final Duration MAX_HORIZON=Duration.ofDays(366);
 private final RecurrenceSeriesRepository seriesRepository;private final ReservationService reservations;
 private final BookingAvailabilityPolicy bookingPolicy;private final CatalogService catalogService;
 private final UserService userService;private final WorkingHoursService workingHours;
 private final CurrentUserProvider currentUser;private final Clock clock;
 private final com.game_manager.gm.resource.ResourceManagementService resources;
 private final com.game_manager.gm.resource.ResourceAccessService resourceAccess;

 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
 public RecurrencePreviewResponse preview(RecurrenceRequest request){reservations.resolveBookingCustomer(request.customerId());return previewInternal(request);}

 @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
 public RecurrenceCreateResponse create(RecurrenceRequest request){UUID customerId=reservations.resolveBookingCustomer(request.customerId());RecurrencePreviewResponse preview=previewInternal(request);
  if(request.conflictPolicy()==RecurrenceConflictPolicy.ALL_OR_NOTHING&&preview.occurrences().stream().anyMatch(item->!item.available()))throw new ApplicationException(HttpStatus.CONFLICT,"Recurring reservation contains unavailable occurrences");
  if(preview.occurrences().stream().noneMatch(RecurrenceOccurrenceResponse::available))throw new ApplicationException(HttpStatus.CONFLICT,"No recurring occurrence could be reserved");
  RecurrenceSeries series=new RecurrenceSeries();series.setCustomerId(customerId);series.setFrequency(request.frequency());series.setIntervalValue(request.interval());series.setRequestedOccurrences(request.occurrences());series.setConflictPolicy(request.conflictPolicy());series=seriesRepository.saveAndFlush(series);
  List<ReservationResponse> created=new ArrayList<>();List<RecurrenceOccurrenceResponse> skipped=new ArrayList<>();
  for(RecurrenceOccurrenceResponse occurrence:preview.occurrences()){
   if(!occurrence.available()){skipped.add(occurrence);continue;}
   try{created.add(reservations.createForCustomer(customerId,new CreateReservationRequest(request.employeeId(),request.serviceId(),request.resourceId(),occurrence.startTime(),request.note(),request.locationId(),customerId,request.areaId(),request.durationMinutes()),series.getId()));}
   catch(ApplicationException exception){if(request.conflictPolicy()==RecurrenceConflictPolicy.ALL_OR_NOTHING
    ||(exception.getStatus()!=HttpStatus.CONFLICT&&exception.getStatus()!=HttpStatus.UNPROCESSABLE_ENTITY&&exception.getStatus()!=HttpStatus.BAD_REQUEST))throw exception;
    skipped.add(new RecurrenceOccurrenceResponse(occurrence.startTime(),occurrence.endTime(),false,exception.getMessage(),
     occurrence.resourceId(),occurrence.resourceCode(),occurrence.resourceName(),occurrence.locationId(),occurrence.locationName()));}
  }
  if(created.isEmpty())throw new ApplicationException(HttpStatus.CONFLICT,"No recurring occurrence could be reserved");
  return new RecurrenceCreateResponse(series.getId(),created,skipped);
 }

 private RecurrencePreviewResponse previewInternal(RecurrenceRequest request){
  CatalogItem service=catalogService.getActiveById(request.serviceId());
  if(service.getType()!=ItemType.SERVICE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Catalog item is not a service");
  int duration=request.durationMinutes()==null ? service.getDurationMinutes() : resources.reservationDuration(service,request.durationMinutes());
  if(!userService.isActiveEmployee(request.employeeId()))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected user is not an active employee");
  AuthenticatedUser actor=currentUser.requireCurrentUser();
  Set<UUID> allowed=actor.role()==Role.EMPLOYEE?resourceAccess.assignedResources(actor):null;
  if(actor.role()==Role.EMPLOYEE){
   if(request.resourceId()!=null) resourceAccess.requireManage(actor,request.resourceId(),Permission.RESERVATION_CREATE);
   else if(allowed.isEmpty()) throw new ApplicationException(HttpStatus.FORBIDDEN,"Station management is not permitted");
  }
  boolean required=resources.requiresResource(service.getId());
  if(actor.role()==Role.EMPLOYEE&&!required&&request.resourceId()==null)
   throw new ApplicationException(HttpStatus.FORBIDDEN,"Station management is not permitted");
  List<Instant> startTimes=starts(request);
  var snapshot=bookingPolicy.prepare(service.getId(),request.resourceId(),request.locationId(),List.of(request.employeeId()),
   startTimes.getFirst(),startTimes.getLast().plus(duration,ChronoUnit.MINUTES),allowed,
   startTimes.stream().map(start->start.atZone(workingHours.getBusinessZone()).toLocalDate()).collect(java.util.stream.Collectors.toSet()),request.areaId());
  List<RecurrenceOccurrenceResponse> occurrences=new ArrayList<>();
  for(Instant start:startTimes){
   Instant end=start.plus(duration,ChronoUnit.MINUTES);
   var state=snapshot.assess(request.employeeId(),start,end);var assigned=state.resource();
   occurrences.add(new RecurrenceOccurrenceResponse(start,end,state.available(),state.reason(),
    assigned==null?null:assigned.id(),assigned==null?null:assigned.code(),assigned==null?null:assigned.name(),
    state.locationId(),state.locationName()));
  }
  return new RecurrencePreviewResponse(workingHours.getBusinessZone().getId(),occurrences,request.conflictPolicy());
 }

 private List<Instant> starts(RecurrenceRequest request){ZoneId zone=workingHours.getBusinessZone();ZonedDateTime base=request.startTime().atZone(zone);List<Instant> values=new ArrayList<>();for(int index=0;index<request.occurrences();index++){ZonedDateTime value=request.frequency()==RecurrenceFrequency.WEEKLY?base.plusWeeks((long)request.interval()*index):base.plusMonths((long)request.interval()*index);values.add(value.toInstant());}if(Duration.between(values.getFirst(),values.getLast()).compareTo(MAX_HORIZON)>0)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Recurrence horizon cannot exceed 366 days");return values;}
}
