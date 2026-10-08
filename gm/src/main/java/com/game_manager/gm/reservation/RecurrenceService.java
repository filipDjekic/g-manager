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
 private final ReservationAvailabilityPolicy availability;private final CatalogService catalogService;
 private final UserService userService;private final WorkingHoursService workingHours;
 private final CurrentUserProvider currentUser;private final Clock clock;
 private final com.game_manager.gm.resource.ResourceManagementService resources;
 private final com.game_manager.gm.resource.ResourceAccessService resourceAccess;

 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
 public RecurrencePreviewResponse preview(RecurrenceRequest request){reservations.resolveBookingCustomer(request.customerId());return previewInternal(request);}

 @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
 public RecurrenceCreateResponse create(RecurrenceRequest request){UUID customerId=reservations.resolveBookingCustomer(request.customerId());RecurrencePreviewResponse preview=previewInternal(request);
  if(request.conflictPolicy()==RecurrenceConflictPolicy.ALL_OR_NOTHING&&preview.occurrences().stream().anyMatch(item->!item.available()))throw new ApplicationException(HttpStatus.CONFLICT,"Recurring reservation contains unavailable occurrences");
  RecurrenceSeries series=new RecurrenceSeries();series.setCustomerId(customerId);series.setFrequency(request.frequency());series.setIntervalValue(request.interval());series.setRequestedOccurrences(request.occurrences());series.setConflictPolicy(request.conflictPolicy());series=seriesRepository.saveAndFlush(series);
  List<ReservationResponse> created=new ArrayList<>();List<RecurrenceOccurrenceResponse> skipped=new ArrayList<>();
  for(RecurrenceOccurrenceResponse occurrence:preview.occurrences()){
   if(!occurrence.available()){skipped.add(occurrence);continue;}
   try{created.add(reservations.createForCustomer(customerId,new CreateReservationRequest(request.employeeId(),request.serviceId(),request.resourceId(),occurrence.startTime(),request.note(),request.locationId()),series.getId()));}
   catch(ApplicationException exception){if(exception.getStatus()==HttpStatus.FORBIDDEN||request.conflictPolicy()==RecurrenceConflictPolicy.ALL_OR_NOTHING)throw exception;skipped.add(new RecurrenceOccurrenceResponse(occurrence.startTime(),occurrence.endTime(),false,exception.getMessage()));}
  }
  if(created.isEmpty())throw new ApplicationException(HttpStatus.CONFLICT,"No recurring occurrence could be reserved");
  return new RecurrenceCreateResponse(series.getId(),created,skipped);
 }

 private RecurrencePreviewResponse previewInternal(RecurrenceRequest request){
  CatalogItem service=catalogService.getActiveById(request.serviceId());
  if(service.getType()!=ItemType.SERVICE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Catalog item is not a service");
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
  if(request.locationId()!=null) resources.requireActiveLocation(request.locationId());
  var selected=request.resourceId()==null?null:resources.requireBookable(request.resourceId(),service.getId());
  if(selected!=null&&request.locationId()!=null&&!request.locationId().equals(resources.locationId(selected)))
   throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Resource does not belong to the selected location");
  List<com.game_manager.gm.resource.PhysicalResource> candidates=selected!=null?List.of(selected)
   :required?resources.bookableResources(service.getId(),request.locationId()).stream().filter(v->allowed==null||allowed.contains(v.getId())).toList():List.of();
  var references=resources.resourceReferences(candidates.stream().map(com.game_manager.gm.resource.PhysicalResource::getId).collect(java.util.stream.Collectors.toSet()));
  List<RecurrenceOccurrenceResponse> occurrences=new ArrayList<>();
  for(Instant start:starts(request)){
   Instant end=start.plus(service.getDurationMinutes(),ChronoUnit.MINUTES);
   String reason=null;com.game_manager.gm.resource.dto.BookingResourceView assigned=null;
   try{
    if(!start.isAfter(clock.instant()))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Occurrence must be in the future");
    availability.requireAvailable(request.employeeId(),start,end,null);
    if(required||selected!=null){
     var candidate=candidates.stream().filter(v->resources.isAvailableForBooking(v,start,end)).findFirst()
      .orElseThrow(()->new ApplicationException(HttpStatus.CONFLICT,"No compatible resource is available at this time"));
     assigned=references.get(candidate.getId());
    }else workingHours.validateWithinWorkingHours(request.locationId(),start,end);
   }catch(ApplicationException exception){reason=exception.getMessage();}
   occurrences.add(new RecurrenceOccurrenceResponse(start,end,reason==null,reason,
    assigned==null?null:assigned.id(),assigned==null?null:assigned.code(),assigned==null?null:assigned.name(),
    assigned==null?null:assigned.locationId(),assigned==null?null:assigned.locationName()));
  }
  return new RecurrencePreviewResponse(workingHours.getBusinessZone().getId(),occurrences);
 }

 private List<Instant> starts(RecurrenceRequest request){ZoneId zone=workingHours.getBusinessZone();ZonedDateTime base=request.startTime().atZone(zone);List<Instant> values=new ArrayList<>();for(int index=0;index<request.occurrences();index++){ZonedDateTime value=request.frequency()==RecurrenceFrequency.WEEKLY?base.plusWeeks((long)request.interval()*index):base.plusMonths((long)request.interval()*index);values.add(value.toInstant());}if(Duration.between(values.getFirst(),values.getLast()).compareTo(MAX_HORIZON)>0)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Recurrence horizon cannot exceed 366 days");return values;}
}
