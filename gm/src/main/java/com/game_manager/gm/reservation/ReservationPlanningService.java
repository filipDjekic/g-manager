package com.game_manager.gm.reservation;

import com.game_manager.gm.catalog.CatalogService;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.reservation.dto.ReservationBookingPlan;
import com.game_manager.gm.reservation.dto.ReservationBookingPlan.Alternative;
import com.game_manager.gm.reservation.dto.ReservationBookingPlan.DayInterval;
import com.game_manager.gm.resource.ResourceAccessService;
import com.game_manager.gm.resource.ResourceManagementService;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReservationPlanningService {
    private final CatalogService catalog;
    private final ResourceManagementService resources;
    private final ResourceAccessService access;
    private final CurrentUserProvider currentUser;
    private final UserRepository users;
    private final BookingAvailabilityPolicy booking;
    private final ReservationAvailabilityPolicy availability;
    private final WorkingHoursService hours;
    private final Clock clock;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_CREATE')")
    public ReservationBookingPlan plan(UUID serviceId, UUID employeeId, UUID resourceId, UUID locationId,
            UUID areaId, LocalDate date, Instant start, Integer durationMinutes) {
        var actor = currentUser.requireCurrentUser();
        if (actor.role() == Role.CUSTOMER) throw new ApplicationException(HttpStatus.FORBIDDEN, "Staff access is required");
        var service = catalog.getActiveById(serviceId);
        if (service.getType() != ItemType.SERVICE) throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Catalog item is not a service");
        int duration = resources.reservationDuration(service, durationMinutes);
        Set<UUID> allowed = access.allResources(actor) ? null : access.assignedResources(actor);
        if (resourceId != null) access.requireManage(actor, resourceId, Permission.RESERVATION_CREATE);
        List<User> employees = employeeId == null ? users.findByRoleAndActiveTrueAndDeletedAtIsNull(Role.EMPLOYEE)
                : List.of(users.findById(employeeId).filter(value -> value.getRole() == Role.EMPLOYEE && value.isActive() && !value.isDeleted())
                        .orElseThrow(() -> new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Selected user is not an active employee")));
        employees = employees.stream().sorted(Comparator.comparing(User::getId)).toList();
        ZoneId zone = hours.getBusinessZone();
        Instant dayStart = date.atStartOfDay(zone).toInstant();
        UUID actualLocation = locationId;
        List<WorkingHoursService.AvailabilityWindow> windows = new ArrayList<>();
        resources.requireBookingArea(areaId,locationId);
        if (resourceId != null) actualLocation = resources.locationId(resources.bookingCandidates(serviceId,resourceId,locationId,areaId).getFirst());
        var yesterday = hours.availabilityWindow(actualLocation,date.minusDays(1));
        var today = hours.availabilityWindow(actualLocation,date);
        if (yesterday != null && yesterday.close().isAfter(dayStart)) windows.add(yesterday);
        if (today != null) windows.add(today);
        Instant dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant();
        if (today != null && today.close().isAfter(dayEnd)) dayEnd = today.close();
        Instant end = start == null ? null : start.plusSeconds(duration * 60L);
        if (start != null && !start.atZone(zone).toLocalDate().equals(date))
            throw new ApplicationException(HttpStatus.BAD_REQUEST,"Reservation date does not match its start time");
        Instant snapshotTo = end != null && end.isAfter(dayEnd) ? end : dayEnd.plusSeconds(duration * 60L);
        var snapshot = booking.prepare(serviceId,resourceId,locationId,employees.stream().map(User::getId).toList(),
                dayStart,snapshotTo,allowed,null,areaId);
        BookingAvailabilityPolicy.Assessment chosen = null;
        UUID chosenEmployee = null;
        if (start != null) for (User employee : employees) {
            var state = snapshot.assess(employee.getId(),start,end);
            if (chosen == null || state.available()) { chosen = state; chosenEmployee = employee.getId(); }
            if (state.available()) break;
        }
        List<Alternative> alternatives = alternatives(snapshot,employees,dayStart,dayEnd,start,duration);
        // If the selected day is full/closed, use the existing availability search horizon.
        if (alternatives.isEmpty() && !employees.isEmpty() && start != null && (chosen == null || !chosen.available() && !List.of(
                "No compatible bookable resource", "Station is unavailable for booking", "Resource or location is inactive or not bookable").contains(Objects.toString(chosen.reason(),"")))) {
            Instant nextDay = date.plusDays(1).atStartOfDay(zone).toInstant();
            Instant through = date.plusDays(BookingAvailabilityPolicy.MAX_RANGE_DAYS).atStartOfDay(zone).toInstant();
            var future = booking.prepare(serviceId,resourceId,locationId,employees.stream().map(User::getId).toList(),
                    nextDay,through.plusSeconds(duration*60L),allowed,null,areaId);
            alternatives = alternatives(future,employees,nextDay,through,start,duration);
        }
        List<DayInterval> intervals = List.of();
        if (resourceId != null) {
            var candidate = resources.bookingCandidates(serviceId,resourceId,locationId,areaId).getFirst();
            boolean restricted = resources.bookingRestrictions(List.of(candidate)).containsKey(resourceId);
            List<Range> busy = new ArrayList<>();
            availability.resourceReservationIntervals(List.of(resourceId),dayStart,dayEnd)
                    .forEach(value -> busy.add(new Range(value.startTime(),value.endTime())));
            availability.resourceSessionIntervals(List.of(resourceId),dayStart,dayEnd)
                    .forEach(value -> busy.add(new Range(value.startTime(),value.endTime())));
            intervals = timeline(dayStart,dayEnd,windows,merge(busy),restricted);
        }
        return new ReservationBookingPlan(zone.getId(),clock.instant(),date,start,end,chosen != null && chosen.available(),
                chosen == null ? "No active employee is available" : chosen.reason(),
                chosen == null || chosen.resource()==null ? null : chosen.resource().id(),chosenEmployee,intervals,alternatives);
    }

    private record Range(Instant start,Instant end) {}

    private List<Alternative> alternatives(BookingAvailabilityPolicy.Snapshot snapshot,List<User> employees,
            Instant from,Instant to,Instant after,int duration) {
        List<Alternative> result = new ArrayList<>();
        for (Instant candidate : snapshot.starts(from,to,15)) {
            if (!candidate.isAfter(clock.instant()) || after != null && candidate.isBefore(after)) continue;
            Instant end = candidate.plusSeconds(duration*60L);
            for (User employee : employees) {
                var state = snapshot.assess(employee.getId(),candidate,end);
                if (state.available()) {
                    result.add(new Alternative(candidate,end,state.resource()==null?null:state.resource().id(),employee.getId()));
                    break;
                }
            }
            if (result.size()==4) break;
        }
        return result;
    }

    private List<Range> merge(List<Range> ranges) {
        List<Range> result = new ArrayList<>();
        for (Range range : ranges.stream().sorted(Comparator.comparing(Range::start)).toList()) {
            if (!result.isEmpty() && !result.getLast().end().isBefore(range.start())) {
                Range previous = result.removeLast();
                result.add(new Range(previous.start(),previous.end().isAfter(range.end())?previous.end():range.end()));
            } else result.add(range);
        }
        return result;
    }

    private List<DayInterval> timeline(Instant from,Instant to,List<WorkingHoursService.AvailabilityWindow> windows,List<Range> busy,boolean restricted) {
        SortedSet<Instant> boundaries = new TreeSet<>(List.of(from,to));
        windows.forEach(window -> { if (window.open().isAfter(from) && window.open().isBefore(to)) boundaries.add(window.open());
            if (window.close().isAfter(from) && window.close().isBefore(to)) boundaries.add(window.close()); });
        busy.forEach(range -> { if (range.start().isAfter(from) && range.start().isBefore(to)) boundaries.add(range.start());
            if (range.end().isAfter(from) && range.end().isBefore(to)) boundaries.add(range.end()); });
        List<Instant> points = new ArrayList<>(boundaries);
        List<DayInterval> result = new ArrayList<>();
        for (int index = 0; index < points.size()-1; index++) {
            Instant begin = points.get(index), finish = points.get(index+1);
            boolean occupied = busy.stream().anyMatch(range -> range.start().isBefore(finish) && range.end().isAfter(begin));
            boolean open = windows.stream().anyMatch(window -> !begin.isBefore(window.open()) && !finish.isAfter(window.close()));
            String status = occupied ? "OCCUPIED" : restricted ? "UNAVAILABLE" : open ? "AVAILABLE" : "CLOSED";
            if (!result.isEmpty() && result.getLast().status().equals(status)) {
                DayInterval previous = result.removeLast();
                result.add(new DayInterval(previous.startTime(),finish,status));
            } else result.add(new DayInterval(begin,finish,status));
        }
        return result;
    }
}
