package com.game_manager.gm.workinghours;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.workinghours.dto.UpdateWorkingHoursRequest;
import com.game_manager.gm.workinghours.dto.WorkingHoursExceptionRequest;
import com.game_manager.gm.workinghours.dto.WorkingHoursExceptionResponse;
import com.game_manager.gm.workinghours.dto.WorkingHoursResponse;
import java.time.DayOfWeek;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkingHoursService {
    private final WorkingHoursRepository workingHoursRepository;
    private final WorkingHoursExceptionRepository exceptionRepository;
    private final CurrentUserProvider currentUserProvider;
    private final GManagerProperties properties;
    private final AuditWriter auditWriter;
    private final Clock clock;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('WORKING_HOURS_READ')")
    public List<WorkingHoursResponse> list() {
        return list(null);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('WORKING_HOURS_READ')")
    public List<WorkingHoursResponse> list(UUID locationId) {
        currentUserProvider.requireCurrentUser();
        List<WorkingHours> values = locationId == null ? workingHoursRepository.findAll().stream()
                .filter(value -> value.getLocationId() == null).toList()
                : workingHoursRepository.findByLocationIdOrderByDayOfWeek(locationId);
        return values.stream()
                .sorted(Comparator.comparingInt(hours -> hours.getDayOfWeek().getValue()))
                .map(WorkingHoursResponse::from)
                .toList();
    }

    @Transactional
    @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')")
    public WorkingHoursResponse update(
            DayOfWeek dayOfWeek, UpdateWorkingHoursRequest request) {
        return update(null, dayOfWeek, request);
    }

    @Transactional
    @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')")
    public WorkingHoursResponse update(
            UUID locationId, DayOfWeek dayOfWeek, UpdateWorkingHoursRequest request) {
        requireManagement();
        validateInterval(request.openTime(), request.closeTime(), HttpStatus.BAD_REQUEST);
        WorkingHours hours = (locationId == null ? workingHoursRepository.findByDayOfWeek(dayOfWeek)
                : workingHoursRepository.findByLocationIdAndDayOfWeek(locationId, dayOfWeek))
                .orElseGet(() -> {
                    WorkingHours created = new WorkingHours();
                    created.setDayOfWeek(dayOfWeek);
                    created.setLocationId(locationId);
                    return created;
                });
        requireVersionIfProvided(hours, request.version());
        java.util.Map<String, Object> before = hours.getId() == null ? null : hoursAuditData(hours);
        hours.setOpenTime(request.openTime());
        hours.setCloseTime(request.closeTime());
        hours.setActive(request.active());
        WorkingHours saved = workingHoursRepository.saveAndFlush(hours);
        auditWriter.write("WORKING_HOURS_UPDATED", "WORKING_HOURS", saved.getId(), before,
                hoursAuditData(saved),
                null, AuditVisibility.MANAGEMENT);
        return WorkingHoursResponse.from(saved);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('WORKING_HOURS_READ')")
    public List<WorkingHoursExceptionResponse> listExceptions() {
        currentUserProvider.requireCurrentUser();
        return exceptionRepository
                .findAllByDateGreaterThanEqualOrderByDateAsc(
                        LocalDate.now(clock.withZone(properties.businessZone())))
                .stream().map(WorkingHoursExceptionResponse::from).toList();
    }

    @Transactional
    @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')")
    public WorkingHoursExceptionResponse createException(WorkingHoursExceptionRequest request) {
        requireManagement();
        validateException(request);
        if (exceptionRepository.existsByDate(request.date())) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "An exception already exists for this date");
        }
        WorkingHoursException exception = new WorkingHoursException();
        apply(exception, request);
        WorkingHoursException saved = exceptionRepository.saveAndFlush(exception);
        auditWriter.write("WORKING_HOURS_EXCEPTION_CREATED", "WORKING_HOURS_EXCEPTION", saved.getId(),
                null, exceptionAuditData(saved), null, AuditVisibility.MANAGEMENT);
        return WorkingHoursExceptionResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')")
    public WorkingHoursExceptionResponse updateException(
            UUID id, WorkingHoursExceptionRequest request) {
        requireManagement();
        validateException(request);
        WorkingHoursException exception = requireException(id);
        requireVersion(exception.getVersion(), request.version());
        exceptionRepository.findByDate(request.date())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ApplicationException(
                            HttpStatus.CONFLICT, "An exception already exists for this date");
                });
        java.util.Map<String, Object> before = exceptionAuditData(exception);
        apply(exception, request);
        WorkingHoursException saved = exceptionRepository.saveAndFlush(exception);
        auditWriter.write("WORKING_HOURS_EXCEPTION_UPDATED", "WORKING_HOURS_EXCEPTION", saved.getId(),
                before, exceptionAuditData(saved), null, AuditVisibility.MANAGEMENT);
        return WorkingHoursExceptionResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')")
    public void deleteException(UUID id, long version) {
        requireManagement();
        WorkingHoursException exception = requireException(id);
        requireVersion(exception.getVersion(), version);
        exceptionRepository.delete(exception);
        exceptionRepository.flush();
        auditWriter.write("WORKING_HOURS_EXCEPTION_DELETED", "WORKING_HOURS_EXCEPTION", id,
                exceptionAuditData(exception), null, "Explicit deletion", AuditVisibility.MANAGEMENT);
    }

    @Transactional(readOnly = true)
    public void validateWithinWorkingHours(Instant startTime, Instant endTime) {
        validateWithinWorkingHours(null, startTime, endTime);
    }

    @Transactional(readOnly = true)
    public void validateWithinWorkingHours(UUID locationId, Instant startTime, Instant endTime) {
        if (startTime == null || endTime == null || !endTime.isAfter(startTime)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Reservation interval is not valid");
        }
        ZoneId businessZone = properties.businessZone();
        ZonedDateTime localStart = startTime.atZone(businessZone);
        LocalDate localDate = localStart.toLocalDate();
        Shift today = shiftFor(locationId, localDate);
        Shift yesterday = shiftFor(locationId, localDate.minusDays(1));

        Shift activeShift = containsStart(today, startTime)
                ? today
                : yesterday != null && yesterday.spansMidnight() && containsStart(yesterday, startTime)
                        ? yesterday : null;
        if (activeShift == null) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Reservation is outside working hours");
        }
        if (endTime.isAfter(activeShift.close())) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "Service duration exceeds working hours");
        }
    }

    public ZoneId getBusinessZone() {
        return properties.businessZone();
    }

    @Transactional(readOnly = true)
    public AvailabilityWindow availabilityWindow(LocalDate date) {
        Shift shift = shiftFor(date);
        return shift == null ? null : new AvailabilityWindow(shift.open(), shift.close());
    }

    @Transactional(readOnly = true)
    public long capacityMinutes(LocalDate from, LocalDate to) {
        long minutes = 0;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            Shift shift = shiftFor(date);
            if (shift != null) minutes += java.time.Duration.between(shift.open(), shift.close()).toMinutes();
        }
        return minutes;
    }

    private Shift shiftFor(LocalDate date) {
        return shiftFor(null, date);
    }

    private Shift shiftFor(UUID locationId, LocalDate date) {
        ZoneId businessZone = properties.businessZone();
        WorkingHoursException exception = locationId == null ? exceptionRepository.findByDate(date).orElse(null)
                : exceptionRepository.findByLocationIdAndDate(locationId, date)
                        .orElseGet(() -> exceptionRepository.findByDate(date).orElse(null));
        if (exception != null && exception.isFullDayClosed()) {
            return null;
        }
        LocalTime open;
        LocalTime close;
        if (exception != null) {
            open = exception.getOverrideOpenTime();
            close = exception.getOverrideCloseTime();
        } else {
            WorkingHours hours = locationId == null
                    ? workingHoursRepository.findByDayOfWeek(date.getDayOfWeek()).orElse(null)
                    : workingHoursRepository.findByLocationIdAndDayOfWeek(locationId, date.getDayOfWeek())
                            .orElseGet(() -> workingHoursRepository.findByDayOfWeek(date.getDayOfWeek()).orElse(null));
            if (hours == null || !hours.isActive()) {
                return null;
            }
            open = hours.getOpenTime();
            close = hours.getCloseTime();
        }
        ZonedDateTime openZdt = ZonedDateTime.of(date, open, businessZone);
        boolean spansMidnight = close.isBefore(open);
        ZonedDateTime closeZdt =
                ZonedDateTime.of(spansMidnight ? date.plusDays(1) : date, close, businessZone);
        return new Shift(openZdt.toInstant(), closeZdt.toInstant(), spansMidnight);
    }

    private static boolean containsStart(Shift shift, Instant start) {
        return shift != null && !start.isBefore(shift.open()) && start.isBefore(shift.close());
    }

    private void validateException(WorkingHoursExceptionRequest request) {
        if (!request.date().isAfter(LocalDate.now(clock.withZone(properties.businessZone())))) {
            throw new ApplicationException(
                    HttpStatus.BAD_REQUEST, "Exception date must be in the future");
        }
        if (request.fullDayClosed()) {
            if (request.overrideOpenTime() != null || request.overrideCloseTime() != null) {
                throw new ApplicationException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "Closed days cannot define override hours");
            }
            return;
        }
        if (request.overrideOpenTime() == null || request.overrideCloseTime() == null) {
            throw new ApplicationException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "Both override times are required");
        }
        validateInterval(
                request.overrideOpenTime(), request.overrideCloseTime(),
                HttpStatus.UNPROCESSABLE_ENTITY);
    }

    private static void validateInterval(LocalTime open, LocalTime close, HttpStatus status) {
        if (open.equals(close)) {
            throw new ApplicationException(status, "Working hours cannot have zero duration");
        }
    }

    private static void apply(
            WorkingHoursException exception, WorkingHoursExceptionRequest request) {
        exception.setDate(request.date());
        exception.setDescription(
                request.description() == null || request.description().isBlank()
                        ? null : request.description().trim());
        exception.setFullDayClosed(request.fullDayClosed());
        exception.setOverrideOpenTime(request.fullDayClosed() ? null : request.overrideOpenTime());
        exception.setOverrideCloseTime(request.fullDayClosed() ? null : request.overrideCloseTime());
    }

    private WorkingHoursException requireException(UUID id) {
        return exceptionRepository.findById(id)
                .orElseThrow(() -> new ApplicationException(
                        HttpStatus.NOT_FOUND, "Working hours exception not found"));
    }

    private AuthenticatedUser requireManagement() {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.OWNER && actor.role() != Role.ADMIN) {
            throw new ApplicationException(
                    HttpStatus.FORBIDDEN, "Working hours management is not permitted");
        }
        return actor;
    }

    private static void requireVersionIfProvided(WorkingHours hours, Long version) {
        if (hours.getId() != null && version != null) {
            requireVersion(hours.getVersion(), version);
        }
    }

    private static void requireVersion(Long actual, Long expected) {
        if (expected == null || !actual.equals(expected)) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "Resource was changed; refresh and try again");
        }
    }

    private static java.util.Map<String, Object> exceptionAuditData(WorkingHoursException value) {
        java.util.Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("date", value.getDate());
        data.put("description", value.getDescription());
        data.put("fullDayClosed", value.isFullDayClosed());
        data.put("overrideOpenTime", value.getOverrideOpenTime());
        data.put("overrideCloseTime", value.getOverrideCloseTime());
        return data;
    }

    private static java.util.Map<String, Object> hoursAuditData(WorkingHours value) {
        return java.util.Map.of("dayOfWeek", value.getDayOfWeek().name(), "active", value.isActive(),
                "openTime", String.valueOf(value.getOpenTime()),
                "closeTime", String.valueOf(value.getCloseTime()));
    }

    private record Shift(Instant open, Instant close, boolean spansMidnight) {
    }

    public record AvailabilityWindow(Instant open, Instant close) {
    }
}
