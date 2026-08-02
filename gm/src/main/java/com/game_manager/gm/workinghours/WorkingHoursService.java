package com.game_manager.gm.workinghours;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.workinghours.dto.UpdateWorkingHoursRequest;
import com.game_manager.gm.workinghours.dto.WorkingHoursExceptionRequest;
import com.game_manager.gm.workinghours.dto.WorkingHoursExceptionResponse;
import com.game_manager.gm.workinghours.dto.WorkingHoursResponse;
import java.time.DayOfWeek;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkingHoursService {
    private final WorkingHoursRepository workingHoursRepository;
    private final WorkingHoursExceptionRepository exceptionRepository;
    private final CurrentUserProvider currentUserProvider;
    private final GManagerProperties properties;

    @Transactional(readOnly = true)
    public List<WorkingHoursResponse> list() {
        currentUserProvider.requireCurrentUser();
        return workingHoursRepository.findAll().stream()
                .sorted(Comparator.comparingInt(hours -> hours.getDayOfWeek().getValue()))
                .map(WorkingHoursResponse::from)
                .toList();
    }

    @Transactional
    public WorkingHoursResponse update(
            DayOfWeek dayOfWeek, UpdateWorkingHoursRequest request) {
        requireManagement();
        validateInterval(request.openTime(), request.closeTime(), HttpStatus.BAD_REQUEST);
        WorkingHours hours = workingHoursRepository.findByDayOfWeek(dayOfWeek)
                .orElseGet(() -> {
                    WorkingHours created = new WorkingHours();
                    created.setDayOfWeek(dayOfWeek);
                    return created;
                });
        requireVersionIfProvided(hours, request.version());
        hours.setOpenTime(request.openTime());
        hours.setCloseTime(request.closeTime());
        hours.setActive(request.active());
        return WorkingHoursResponse.from(workingHoursRepository.saveAndFlush(hours));
    }

    @Transactional(readOnly = true)
    public List<WorkingHoursExceptionResponse> listExceptions() {
        currentUserProvider.requireCurrentUser();
        return exceptionRepository
                .findAllByDateGreaterThanEqualOrderByDateAsc(
                        LocalDate.now(properties.businessZone()))
                .stream().map(WorkingHoursExceptionResponse::from).toList();
    }

    @Transactional
    public WorkingHoursExceptionResponse createException(WorkingHoursExceptionRequest request) {
        requireManagement();
        validateException(request);
        if (exceptionRepository.existsByDate(request.date())) {
            throw new ApplicationException(
                    HttpStatus.CONFLICT, "An exception already exists for this date");
        }
        WorkingHoursException exception = new WorkingHoursException();
        apply(exception, request);
        return WorkingHoursExceptionResponse.from(exceptionRepository.saveAndFlush(exception));
    }

    @Transactional
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
        apply(exception, request);
        return WorkingHoursExceptionResponse.from(exceptionRepository.saveAndFlush(exception));
    }

    @Transactional
    public void deleteException(UUID id, long version) {
        requireManagement();
        WorkingHoursException exception = requireException(id);
        requireVersion(exception.getVersion(), version);
        exceptionRepository.delete(exception);
        exceptionRepository.flush();
    }

    @Transactional(readOnly = true)
    public void validateWithinWorkingHours(Instant startTime, Instant endTime) {
        if (startTime == null || endTime == null || !endTime.isAfter(startTime)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Reservation interval is not valid");
        }
        ZoneId businessZone = properties.businessZone();
        ZonedDateTime localStart = startTime.atZone(businessZone);
        LocalDate localDate = localStart.toLocalDate();
        Shift today = shiftFor(localDate);
        Shift yesterday = shiftFor(localDate.minusDays(1));

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

    private Shift shiftFor(LocalDate date) {
        ZoneId businessZone = properties.businessZone();
        WorkingHoursException exception = exceptionRepository.findByDate(date).orElse(null);
        if (exception != null && exception.isFullDayClosed()) {
            return null;
        }
        LocalTime open;
        LocalTime close;
        if (exception != null) {
            open = exception.getOverrideOpenTime();
            close = exception.getOverrideCloseTime();
        } else {
            WorkingHours hours = workingHoursRepository.findByDayOfWeek(date.getDayOfWeek())
                    .orElse(null);
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
        if (!request.date().isAfter(LocalDate.now(properties.businessZone()))) {
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

    private record Shift(Instant open, Instant close, boolean spansMidnight) {
    }
}
