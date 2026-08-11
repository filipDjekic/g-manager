package com.game_manager.gm.reservation;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.AuthorizationDenialLogger;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReservationTransitionPolicy {
    private final AuthorizationDenialLogger denialLogger;
    private final GManagerProperties properties;
    private final Clock clock;

    public void requireTransition(AuthenticatedUser actor, Reservation reservation,
            ReservationStatus target, String reason) {
        if (!isAuthorized(actor, reservation, target)) {
            denialLogger.denied(Permission.RESERVATION_CHANGE_STATUS, actor, "reservation",
                    scope(actor, reservation));
            throw new ApplicationException(HttpStatus.FORBIDDEN,
                    "This reservation action is not permitted");
        }
        if (!isGraphTransition(reservation.getStatus(), target)) {
            throw new ApplicationException(HttpStatus.CONFLICT,
                    "Invalid reservation status transition");
        }
        validateTemporalRules(actor, reservation, target);
        if (requiresReason(target) && (reason == null || reason.isBlank())) {
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "A reason is required to reject or cancel a reservation");
        }
    }

    public List<ReservationStatus> allowedActions(
            AuthenticatedUser actor, Reservation reservation) {
        return candidates(reservation.getStatus()).stream()
                .filter(target -> isAuthorized(actor, reservation, target))
                .filter(target -> isTemporallyAllowed(actor, reservation, target))
                .toList();
    }

    public boolean requiresReason(ReservationStatus target) {
        return target == ReservationStatus.REJECTED || target == ReservationStatus.CANCELLED;
    }

    private List<ReservationStatus> candidates(ReservationStatus current) {
        return switch (current) {
            case PENDING -> List.of(ReservationStatus.CONFIRMED, ReservationStatus.REJECTED,
                    ReservationStatus.CANCELLED);
            case CONFIRMED -> List.of(ReservationStatus.COMPLETED, ReservationStatus.CANCELLED);
            case REJECTED, CANCELLED, COMPLETED -> List.of();
        };
    }

    private boolean isGraphTransition(ReservationStatus current, ReservationStatus target) {
        return candidates(current).contains(target);
    }

    private boolean isAuthorized(
            AuthenticatedUser actor, Reservation reservation, ReservationStatus target) {
        boolean management = actor.role() == Role.ADMIN || actor.role() == Role.OWNER;
        boolean assignedEmployee = actor.role() == Role.EMPLOYEE
                && actor.id().equals(reservation.getEmployeeId());
        boolean owningCustomer = actor.role() == Role.CUSTOMER
                && actor.id().equals(reservation.getCustomerId());
        return switch (target) {
            case CONFIRMED, REJECTED, COMPLETED -> management || assignedEmployee;
            case CANCELLED -> management || owningCustomer;
            case PENDING -> false;
        };
    }

    private boolean isTemporallyAllowed(
            AuthenticatedUser actor, Reservation reservation, ReservationStatus target) {
        if (target == ReservationStatus.CONFIRMED) {
            return reservation.getStartTime().isAfter(clock.instant());
        }
        if (target == ReservationStatus.COMPLETED) {
            return !clock.instant().isBefore(reservation.getEndTime());
        }
        return target != ReservationStatus.CANCELLED
                || actor.role() != Role.CUSTOMER
                || reservation.getStatus() != ReservationStatus.CONFIRMED
                || clock.instant().isBefore(reservation.getStartTime().minus(
                        properties.reservations().cancellationCutoffMinutes(), ChronoUnit.MINUTES));
    }

    private void validateTemporalRules(
            AuthenticatedUser actor, Reservation reservation, ReservationStatus target) {
        if (isTemporallyAllowed(actor, reservation, target)) return;
        if (target == ReservationStatus.CONFIRMED) {
            throw new ApplicationException(HttpStatus.CONFLICT,
                    "Past reservations cannot be confirmed");
        }
        if (target == ReservationStatus.COMPLETED) {
            throw new ApplicationException(HttpStatus.CONFLICT,
                    "Reservation has not ended yet");
        }
        throw new ApplicationException(HttpStatus.CONFLICT,
                "It is too late to cancel this reservation");
    }

    private String scope(AuthenticatedUser actor, Reservation reservation) {
        if (actor.role() == Role.CUSTOMER && actor.id().equals(reservation.getCustomerId())) {
            return "customer-owner";
        }
        if (actor.role() == Role.EMPLOYEE && actor.id().equals(reservation.getEmployeeId())) {
            return "assigned-employee";
        }
        return "unrelated";
    }
}
