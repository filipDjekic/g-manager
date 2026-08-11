package com.game_manager.gm.reservation;

import com.game_manager.gm.common.error.ApplicationException;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import com.game_manager.gm.timeoff.TimeOffAvailabilityPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReservationAvailabilityPolicy {
    private static final List<ReservationStatus> NON_BLOCKING =
            List.of(ReservationStatus.CANCELLED, ReservationStatus.REJECTED);
    private final ReservationRepository repository;
    private final TimeOffAvailabilityPolicy timeOffPolicy;

    public void requireAvailable(UUID employeeId, Instant start, Instant end, UUID excludeId) {
        if (!isAvailable(employeeId, start, end, excludeId)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Employee is unavailable at this time");
        }
    }

    public boolean isAvailable(UUID employeeId, Instant start, Instant end, UUID excludeId) {
        return repository.findConflicting(employeeId, start, end, NON_BLOCKING, excludeId).isEmpty()
                && timeOffPolicy.isAvailable(employeeId, start, end);
    }

    public List<ReservationBusyInterval> busyIntervals(
            Collection<UUID> employeeIds, Instant from, Instant to) {
        if (employeeIds.isEmpty()) return List.of();
        return repository.findBlockingBetween(employeeIds, from, to, NON_BLOCKING);
    }
}
