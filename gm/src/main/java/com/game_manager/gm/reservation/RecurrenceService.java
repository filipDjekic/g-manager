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

 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
 public RecurrencePreviewResponse preview(RecurrenceRequest request){customer();return previewInternal(request);}

 @Transactional @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
 public RecurrenceCreateResponse create(RecurrenceRequest request){AuthenticatedUser actor=customer();RecurrencePreviewResponse preview=previewInternal(request);
  if(request.conflictPolicy()==RecurrenceConflictPolicy.ALL_OR_NOTHING&&preview.occurrences().stream().anyMatch(item->!item.available()))throw new ApplicationException(HttpStatus.CONFLICT,"Recurring reservation contains unavailable occurrences");
  RecurrenceSeries series=new RecurrenceSeries();series.setCustomerId(actor.id());series.setFrequency(request.frequency());series.setIntervalValue(request.interval());series.setRequestedOccurrences(request.occurrences());series.setConflictPolicy(request.conflictPolicy());series=seriesRepository.saveAndFlush(series);
  List<ReservationResponse> created=new ArrayList<>();List<RecurrenceOccurrenceResponse> skipped=new ArrayList<>();
  for(RecurrenceOccurrenceResponse occurrence:preview.occurrences()){
   if(!occurrence.available()){skipped.add(occurrence);continue;}
   try{created.add(reservations.createForCustomer(actor.id(),new CreateReservationRequest(request.employeeId(),request.serviceId(),occurrence.startTime(),request.note()),series.getId()));}
   catch(ApplicationException exception){if(request.conflictPolicy()==RecurrenceConflictPolicy.ALL_OR_NOTHING)throw exception;skipped.add(new RecurrenceOccurrenceResponse(occurrence.startTime(),occurrence.endTime(),false,exception.getMessage()));}
  }
  if(created.isEmpty())throw new ApplicationException(HttpStatus.CONFLICT,"No recurring occurrence could be reserved");
  return new RecurrenceCreateResponse(series.getId(),created,skipped);
 }

 private RecurrencePreviewResponse previewInternal(RecurrenceRequest request){CatalogItem service=catalogService.getActiveById(request.serviceId());if(service.getType()!=ItemType.SERVICE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Catalog item is not a service");if(!userService.isActiveEmployee(request.employeeId()))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected user is not an active employee");
  List<Instant> starts=starts(request);List<RecurrenceOccurrenceResponse> occurrences=new ArrayList<>();for(Instant start:starts){Instant end=start.plus(service.getDurationMinutes(),ChronoUnit.MINUTES);String reason=null;try{if(!start.isAfter(clock.instant()))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Occurrence must be in the future");workingHours.validateWithinWorkingHours(start,end);availability.requireAvailable(request.employeeId(),start,end,null);}catch(ApplicationException exception){reason=exception.getMessage();}occurrences.add(new RecurrenceOccurrenceResponse(start,end,reason==null,reason));}return new RecurrencePreviewResponse(workingHours.getBusinessZone().getId(),occurrences);}
 private List<Instant> starts(RecurrenceRequest request){ZoneId zone=workingHours.getBusinessZone();ZonedDateTime base=request.startTime().atZone(zone);List<Instant> values=new ArrayList<>();for(int index=0;index<request.occurrences();index++){ZonedDateTime value=request.frequency()==RecurrenceFrequency.WEEKLY?base.plusWeeks((long)request.interval()*index):base.plusMonths((long)request.interval()*index);values.add(value.toInstant());}if(Duration.between(values.getFirst(),values.getLast()).compareTo(MAX_HORIZON)>0)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Recurrence horizon cannot exceed 366 days");return values;}
 private AuthenticatedUser customer(){AuthenticatedUser actor=currentUser.requireCurrentUser();if(actor.role()!=Role.CUSTOMER)throw new ApplicationException(HttpStatus.FORBIDDEN,"Only customers can create recurring reservations");return actor;}
}
