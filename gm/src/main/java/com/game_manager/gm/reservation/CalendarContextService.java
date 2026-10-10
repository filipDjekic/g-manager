package com.game_manager.gm.reservation;

import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.gamingsession.GamingSessionRepository;
import com.game_manager.gm.gamingsession.GamingSessionStatus;
import com.game_manager.gm.reservation.dto.CalendarContextResponse;
import com.game_manager.gm.reservation.dto.CalendarContextResponse.*;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.station.GamingStationProfileRepository;
import com.game_manager.gm.machine.StationClientEnforcementRepository;
import com.game_manager.gm.machine.StationClientEnforcement;
import com.game_manager.gm.machine.StationEnforcementStatus;
import com.game_manager.gm.timeoff.TimeOffAvailabilityPolicy;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CalendarContextService {
    private final LocationRepository locations;
    private final AreaRepository areas;
    private final PhysicalResourceRepository resources;
    private final ResourceManagementService management;
    private final ResourceAccessService access;
    private final CurrentUserProvider currentUser;
    private final ReservationAvailabilityPolicy availability;
    private final TimeOffAvailabilityPolicy timeOff;
    private final GamingSessionRepository sessions;
    private final GamingStationProfileRepository stationProfiles;
    private final StationClientEnforcementRepository enforcementStates;
    private final WorkingHoursService hours;
    private final Clock clock;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
    public CalendarContextResponse context(LocalDate date, ReservationScope scope, UUID locationId,
            UUID areaId, UUID resourceId, UUID employeeId) {
        var actor = currentUser.requireCurrentUser();
        Set<UUID> assigned = access.assignedResources(actor);
        boolean manageableOnly = actor.role() == Role.EMPLOYEE && scope == ReservationScope.MANAGEABLE;
        var locationValues = locations.findAllByOrderByNameAsc().stream()
                .filter(value -> locationId == null || locationId.equals(value.getId())).toList();
        Map<UUID, String> names = locationValues.stream().collect(Collectors.toMap(Location::getId, Location::getName));
        var areaValues = areas.findAll().stream().filter(value -> names.containsKey(value.getLocationId()))
                .filter(value -> areaId == null || areaId.equals(value.getId()))
                .sorted(Comparator.comparing((Area value) -> names.get(value.getLocationId())).thenComparing(Area::getLocationId)
                        .thenComparingInt(Area::getDisplayOrder).thenComparing(Area::getName)).toList();
        var values = areaValues.isEmpty() ? List.<PhysicalResource>of()
                : resources.findByAreaIdInOrderByDisplayOrderAscNameAsc(areaValues.stream().map(Area::getId).toList()).stream()
                        .filter(value -> resourceId == null || resourceId.equals(value.getId()))
                        .filter(value -> !manageableOnly || assigned.contains(value.getId())).toList();
        Set<UUID> ids = values.stream().map(PhysicalResource::getId).collect(Collectors.toSet());
        var references = management.resourceReferences(ids);
        var restrictions = management.bookingRestrictions(values);
        Set<UUID> visibleLocations = resourceId != null ? references.values().stream().map(value -> value.locationId()).collect(Collectors.toSet())
                : areaId != null ? areaValues.stream().map(Area::getLocationId).collect(Collectors.toSet()) : names.keySet();
        ZoneId zone = hours.getBusinessZone();
        Instant from = date.atStartOfDay(zone).toInstant();
        Instant end = date.plusDays(1).atStartOfDay(zone).toInstant();
        List<LocationHours> locationHours = new ArrayList<>();
        for (var location : locationValues) {
            if (!visibleLocations.contains(location.getId())) continue;
            List<Window> windows = new ArrayList<>();
            var previous = hours.availabilityWindow(location.getId(), date.minusDays(1));
            var current = hours.availabilityWindow(location.getId(), date);
            if (previous != null && previous.close().isAfter(from))
                windows.add(new Window(from, previous.close()));
            if (current != null) {
                windows.add(new Window(current.open(), current.close()));
                if (current.close().isAfter(end)) end = current.close();
            }
            locationHours.add(new LocationHours(location.getId(), location.getName(), windows));
        }
        List<Occupancy> occupancy = new ArrayList<>();
        availability.resourceReservationIntervals(ids, from, end).forEach(value ->
                occupancy.add(new Occupancy(value.resourceId(), value.startTime(), value.endTime(), "RESERVATION")));
        availability.resourceSessionIntervals(ids, from, end).forEach(value ->
                occupancy.add(new Occupancy(value.resourceId(), value.startTime(), value.endTime(), "SESSION")));
        List<EmployeeBlock> employeeBlocks = new ArrayList<>();
        if (employeeId != null) {
            availability.busyIntervals(List.of(employeeId), from, end).forEach(value ->
                    employeeBlocks.add(new EmployeeBlock(value.startTime(), value.endTime(), "RESERVATION")));
            timeOff.approvedBetween(List.of(employeeId), from, end).forEach(value ->
                    employeeBlocks.add(new EmployeeBlock(value.start(), value.end(), "TIME_OFF")));
        }
        // ACTIVE is the session domain's current occupancy; future bookings never enter this count.
        var activeSessions = ids.isEmpty() ? List.<com.game_manager.gm.gamingsession.GamingSession>of()
                : sessions.findByResourceIdInAndStatus(ids, GamingSessionStatus.ACTIVE);
        Set<UUID> activeIds = activeSessions.stream().map(value -> value.getResourceId()).collect(Collectors.toSet());
        long occupied = activeIds.size();
        var profiles = ids.isEmpty() ? Map.<UUID,com.game_manager.gm.station.GamingStationProfile>of()
                : stationProfiles.findByResourceIdIn(ids).stream().collect(Collectors.toMap(value -> value.getResourceId(), value -> value));
        var states = ids.isEmpty() ? Map.<UUID,StationClientEnforcement>of() : enforcementStates.findByStationIdIn(ids).stream()
                .collect(Collectors.toMap(StationClientEnforcement::getStationId, value -> value));
        var latest = profiles.isEmpty() ? Map.<UUID,com.game_manager.gm.gamingsession.GamingSession>of()
                : sessions.findLatestCandidates(profiles.keySet()).stream().collect(Collectors.toMap(value -> value.getResourceId(), value -> value, (first, ignored) -> first));
        Instant now = clock.instant();
        var rows = values.stream().map(value -> {
            var reference = references.get(value.getId());
            String restriction = restrictions.get(value.getId());
            var station = profiles.get(value.getId());
            var state = states.get(value.getId());
            var lastSession = latest.get(value.getId());
            // Current observations only: these do not invent historical maintenance intervals
            // or change the authoritative booking/session admission policies.
            if (restriction == null && station != null && station.isClientEnabled()) {
                if (lastSession != null && lastSession.getStatus() != GamingSessionStatus.ACTIVE
                        && (state == null || !lastSession.getId().equals(state.getSessionId()) || state.getEnforcementStatus() != StationEnforcementStatus.LOCKED))
                    restriction = "STATION_LOCK_PENDING";
                else if (state != null && !activeIds.contains(value.getId())
                        && state.getEnforcementStatus() != StationEnforcementStatus.LOCKED && state.getEnforcementStatus() != StationEnforcementStatus.UNKNOWN)
                    restriction = "STATION_LOCK_PENDING";
                else if (station.getLastHeartbeatAt() == null || !station.getLastHeartbeatAt().plusSeconds(station.getOfflineGraceSeconds()).isAfter(now))
                    restriction = "STATION_CLIENT_OFFLINE";
            }
            if (restriction == null && activeIds.contains(value.getId())) restriction = "Resource has an active gaming session";
            return new ResourceRow(value.getId(), value.getCode(), value.getName(), value.getType(),
                    reference.locationId(), reference.locationName(), reference.areaId(), reference.areaName(),
                    access.canManage(actor, value.getId(), assigned), restriction);
        }).toList();
        Set<UUID> rowAreas = values.stream().map(PhysicalResource::getAreaId).collect(Collectors.toSet());
        var zones = areaValues.stream().filter(value -> resourceId == null || rowAreas.contains(value.getId())).map(value -> new Zone(value.getId(), value.getLocationId(),
                names.get(value.getLocationId()), value.getName(), value.isActive(), value.getDisplayOrder())).toList();
        return new CalendarContextResponse(zone.getId(), clock.instant(), from, end,
                locationHours, zones, rows, occupancy, employeeBlocks, occupied);
    }
}
