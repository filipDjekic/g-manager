package com.game_manager.gm.availability;

import com.game_manager.gm.availability.dto.AvailabilityQuery;
import com.game_manager.gm.availability.dto.AvailabilityResponse;
import com.game_manager.gm.availability.dto.AvailabilitySlotResponse;
import com.game_manager.gm.availability.dto.EmployeeAvailabilityResponse;
import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogService;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.reservation.ReservationAvailabilityPolicy;
import com.game_manager.gm.reservation.ReservationBusyInterval;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AvailabilityService {
    static final int SLOT_INCREMENT_MINUTES = 15;
    static final long MAX_RANGE_DAYS = 31;

    private final CatalogService catalogService;
    private final UserRepository userRepository;
    private final WorkingHoursService workingHoursService;
    private final ReservationAvailabilityPolicy reservationPolicy;
    private final Clock clock;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CATALOG_READ')")
    public AvailabilityResponse find(AvailabilityQuery query) {
        validateRange(query.from(), query.to());
        CatalogItem service = catalogService.getActiveById(query.serviceId());
        if (service.getType() != ItemType.SERVICE) {
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Catalog item is not a service");
        }
        List<User> employees = employees(query.employeeId());
        List<WorkingHoursService.AvailabilityWindow> windows = windows(query.from(), query.to());
        List<ReservationBusyInterval> busy = windows.isEmpty() ? List.of()
                : reservationPolicy.busyIntervals(employees.stream().map(User::getId).toList(),
                        windows.getFirst().open(), windows.getLast().close());
        Map<UUID, List<ReservationBusyInterval>> busyByEmployee = busy.stream()
                .collect(Collectors.groupingBy(ReservationBusyInterval::employeeId));

        List<EmployeeAvailabilityResponse> result = employees.stream().map(employee ->
                new EmployeeAvailabilityResponse(employee.getId(), employee.getName(),
                        slots(windows, service.getDurationMinutes(),
                                busyByEmployee.getOrDefault(employee.getId(), List.of())))).toList();
        return new AvailabilityResponse(workingHoursService.getBusinessZone().getId(), service.getId(),
                service.getName(), service.getDurationMinutes(), SLOT_INCREMENT_MINUTES,
                query.from(), query.to(), result);
    }

    private List<User> employees(UUID employeeId) {
        if (employeeId == null) {
            return userRepository.findByRoleAndActiveTrueAndDeletedAtIsNull(Role.EMPLOYEE).stream()
                    .sorted(Comparator.comparing(User::getName).thenComparing(User::getId)).toList();
        }
        User employee = userRepository.findById(employeeId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Employee not found"));
        if (!employee.isActive() || employee.getRole() != Role.EMPLOYEE) {
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Selected user is not an active employee");
        }
        return List.of(employee);
    }

    private List<WorkingHoursService.AvailabilityWindow> windows(LocalDate from, LocalDate to) {
        List<WorkingHoursService.AvailabilityWindow> windows = new ArrayList<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            WorkingHoursService.AvailabilityWindow window = workingHoursService.availabilityWindow(date);
            if (window != null) windows.add(window);
        }
        return windows;
    }

    private List<AvailabilitySlotResponse> slots(
            List<WorkingHoursService.AvailabilityWindow> windows,
            int durationMinutes,
            List<ReservationBusyInterval> busy) {
        Instant now = clock.instant();
        List<AvailabilitySlotResponse> slots = new ArrayList<>();
        for (WorkingHoursService.AvailabilityWindow window : windows) {
            for (Instant start = window.open(); ; start = start.plus(SLOT_INCREMENT_MINUTES, ChronoUnit.MINUTES)) {
                Instant end = start.plus(durationMinutes, ChronoUnit.MINUTES);
                if (end.isAfter(window.close())) break;
                Instant slotStart = start;
                if (slotStart.isAfter(now) && busy.stream().noneMatch(interval -> interval.overlaps(slotStart, end))) {
                    slots.add(new AvailabilitySlotResponse(slotStart, end));
                }
            }
        }
        return List.copyOf(slots);
    }

    private static void validateRange(LocalDate from, LocalDate to) {
        long days = ChronoUnit.DAYS.between(from, to);
        if (days < 0 || days >= MAX_RANGE_DAYS) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST,
                    "Availability range must contain between 1 and 31 days");
        }
    }
}
