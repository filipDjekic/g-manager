package com.game_manager.gm.reservation;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.resource.PhysicalResource;
import com.game_manager.gm.resource.ResourceManagementService;
import com.game_manager.gm.resource.dto.BookingResourceView;
import com.game_manager.gm.timeoff.TimeOffAvailabilityPolicy;
import com.game_manager.gm.timeoff.TimeOffInterval;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** One batch snapshot shared by occupancy, waitlist admission and recurrence preview.
 * Mutations still perform the existing locked reservation checks. */
@Component
@RequiredArgsConstructor
public class BookingAvailabilityPolicy {
    private final ReservationAvailabilityPolicy reservations;
    private final TimeOffAvailabilityPolicy timeOff;
    private final ResourceManagementService resources;
    private final WorkingHoursService hours;
    private final Clock clock;

    public record Assessment(BookingSlotStatus status, String reason, BookingResourceView resource,
            UUID locationId, String locationName) {
        public boolean available() { return status == BookingSlotStatus.AVAILABLE; }
    }

    public Snapshot prepare(UUID serviceId, UUID resourceId, UUID locationId, Collection<UUID> employeeIds,
            Instant from, Instant to, Set<UUID> allowedIds) {
        return prepare(serviceId,resourceId,locationId,employeeIds,from,to,allowedIds,null);
    }

    public Snapshot prepare(UUID serviceId, UUID resourceId, UUID locationId, Collection<UUID> employeeIds,
            Instant from, Instant to, Set<UUID> allowedIds, Set<LocalDate> occurrenceDays) {
        boolean required = resources.requiresResource(serviceId) || resourceId != null;
        List<PhysicalResource> candidates = required ? resources.bookingCandidates(serviceId,resourceId,locationId)
                .stream().filter(v -> allowedIds == null || allowedIds.contains(v.getId())).toList() : List.of();
        Set<UUID> ids = candidates.stream().map(PhysicalResource::getId).collect(Collectors.toSet());
        Map<UUID,BookingResourceView> refs = resources.resourceReferences(ids);
        Map<UUID,String> restrictions = resources.bookingRestrictions(candidates);
        Set<UUID> locations = refs.values().stream().map(BookingResourceView::locationId).collect(Collectors.toSet());
        if (locationId != null) locations.add(locationId);
        Map<UUID,String> names = resources.locationNames(locations);
        String locationRestriction = null;
        if (locationId != null) {
            try { resources.requireActiveLocation(locationId); }
            catch (ApplicationException ex) {
                if (ex.getStatus() != HttpStatus.UNPROCESSABLE_ENTITY) throw ex;
                locationRestriction = ex.getMessage();
            }
        }
        Map<UUID,List<WorkingHoursService.AvailabilityWindow>> windows = new HashMap<>();
        if (!required) locations.add(locationId);
        LocalDate first = from.atZone(hours.getBusinessZone()).toLocalDate().minusDays(1);
        LocalDate last = to.atZone(hours.getBusinessZone()).toLocalDate();
        SortedSet<LocalDate> days=new TreeSet<>();
        if(occurrenceDays==null)for(LocalDate day=first;!day.isAfter(last);day=day.plusDays(1))days.add(day);
        else for(LocalDate day:occurrenceDays){days.add(day.minusDays(1));days.add(day);}
        for (UUID location : locations) {
            List<WorkingHoursService.AvailabilityWindow> values = new ArrayList<>();
            for (LocalDate day : days) {
                var window = hours.availabilityWindow(location,day);
                if (window != null) values.add(window);
            }
            windows.put(location,values);
        }
        return new Snapshot(required,locationId,locationId==null?null:names.get(locationId),locationRestriction,refs,restrictions,windows,
                reservations.busyIntervals(employeeIds,from,to).stream().collect(Collectors.groupingBy(ReservationBusyInterval::employeeId)),
                timeOff.approvedBetween(employeeIds,from,to).stream().collect(Collectors.groupingBy(TimeOffInterval::employeeId)),
                reservations.resourceReservationIntervals(ids,from,to).stream().collect(Collectors.groupingBy(ResourceBusyInterval::resourceId)),
                reservations.resourceSessionIntervals(ids,from,to).stream().collect(Collectors.groupingBy(ResourceBusyInterval::resourceId)),clock.instant());
    }

    public static final class Snapshot {
        public boolean resourceRequired() { return required; }
        private final boolean required;
        private final UUID locationId;
        private final String locationName, locationRestriction;
        private final List<BookingResourceView> resources;
        private final Map<UUID,String> restrictions;
        private final Map<UUID,List<WorkingHoursService.AvailabilityWindow>> windows;
        private final Map<UUID,List<ReservationBusyInterval>> employeeBusy;
        private final Map<UUID,List<TimeOffInterval>> timeOff;
        private final Map<UUID,List<ResourceBusyInterval>> resourceBusy, sessions;
        private final Instant now;

        private Snapshot(boolean required,UUID locationId,String locationName,String locationRestriction,
                Map<UUID,BookingResourceView> resources,Map<UUID,String> restrictions,
                Map<UUID,List<WorkingHoursService.AvailabilityWindow>> windows,
                Map<UUID,List<ReservationBusyInterval>> employeeBusy,Map<UUID,List<TimeOffInterval>> timeOff,
                Map<UUID,List<ResourceBusyInterval>> resourceBusy,Map<UUID,List<ResourceBusyInterval>> sessions,Instant now) {
            this.required=required;this.locationId=locationId;this.locationName=locationName;
            this.locationRestriction=locationRestriction;this.resources=resources.values().stream().sorted(Comparator.comparing(BookingResourceView::id)).toList();this.restrictions=restrictions;
            this.windows=windows;this.employeeBusy=employeeBusy;this.timeOff=timeOff;
            this.resourceBusy=resourceBusy;this.sessions=sessions;this.now=now;
        }

        public SortedSet<Instant> starts(Instant from,Instant to,int incrementMinutes) {
            SortedSet<Instant> values=new TreeSet<>();
            for (Instant start=from;start.isBefore(to);start=start.plusSeconds(incrementMinutes*60L)) values.add(start);
            // Preserve slots anchored at the opening time, including shifts across midnight.
            for (var list:windows.values()) for (var window:list)
                for (Instant start=window.open();start.isBefore(window.close());start=start.plusSeconds(incrementMinutes*60L))
                    if (!start.isBefore(from)&&start.isBefore(to)) values.add(start);
            return values;
        }

        public Assessment assess(UUID employee,Instant start,Instant end) {
            BookingResourceView selected=resources.size()==1?resources.getFirst():null;
            if (!start.isAfter(now)) return result(BookingSlotStatus.UNAVAILABLE,"Slot must be in the future",selected);
            if (locationRestriction!=null) return result(BookingSlotStatus.UNAVAILABLE,locationRestriction,selected);
            if (timeOff.getOrDefault(employee,List.of()).stream().anyMatch(v->v.overlaps(start,end)))
                return result(BookingSlotStatus.UNAVAILABLE,"Employee is on approved time off",selected);
            boolean busy=employeeBusy.getOrDefault(employee,List.of()).stream().anyMatch(v->v.overlaps(start,end));
            if (!required) {
                if (!withinHours(locationId,start,end)) return result(BookingSlotStatus.UNAVAILABLE,"Reservation is outside working hours",null);
                return result(busy?BookingSlotStatus.OCCUPIED_RESERVATION:BookingSlotStatus.AVAILABLE,
                        busy?"Employee has a reservation at this time":null,null);
            }
            Assessment occupied=null,unavailable=null;
            for (BookingResourceView resource:resources) {
                String restriction=restrictions.get(resource.id());
                if (restriction==null&&!withinHours(resource.locationId(),start,end)) restriction="Reservation is outside working hours";
                if (restriction!=null) {if(unavailable==null)unavailable=result(BookingSlotStatus.UNAVAILABLE,restriction,resource);continue;}
                Assessment value;
                if(sessions.getOrDefault(resource.id(),List.of()).stream().anyMatch(v->v.overlaps(start,end)))
                    value=result(BookingSlotStatus.OCCUPIED_SESSION,"Resource has an active gaming session",resource);
                else if(resourceBusy.getOrDefault(resource.id(),List.of()).stream().anyMatch(v->v.overlaps(start,end)))
                    value=result(BookingSlotStatus.OCCUPIED_RESOURCE,"Resource has a reservation at this time",resource);
                else if(busy) value=result(BookingSlotStatus.OCCUPIED_RESERVATION,"Employee has a reservation at this time",resource);
                else return result(BookingSlotStatus.AVAILABLE,null,resource);
                if(occupied==null)occupied=value;
            }
            return occupied!=null?occupied:unavailable!=null?unavailable:result(BookingSlotStatus.UNAVAILABLE,"No compatible bookable resource",null);
        }

        private boolean withinHours(UUID location,Instant start,Instant end) {
            return windows.getOrDefault(location,List.of()).stream()
                    .filter(v->!start.isBefore(v.open())&&start.isBefore(v.close()))
                    .max(Comparator.comparing(WorkingHoursService.AvailabilityWindow::open))
                    .map(v->!end.isAfter(v.close())).orElse(false);
        }
        private Assessment result(BookingSlotStatus status,String reason,BookingResourceView resource) {
            return new Assessment(status,reason,resource,resource==null?locationId:resource.locationId(),resource==null?locationName:resource.locationName());
        }
    }
}
