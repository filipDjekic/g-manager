package com.game_manager.gm.reservation;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.AuthorizationDenialLogger;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReservationAuthorizationPolicy {
    private final AuthorizationDenialLogger denialLogger;

    public void requireTransition(
            AuthenticatedUser actor, Reservation reservation, ReservationStatus target) {
        if (!canTransition(actor, reservation, target)) {
            boolean employeeOwner = actor.role() == Role.EMPLOYEE
                    && actor.id().equals(reservation.getEmployeeId());
            boolean customerOwner = actor.role() == Role.CUSTOMER
                    && actor.id().equals(reservation.getCustomerId());
            denialLogger.denied(Permission.RESERVATION_CHANGE_STATUS, actor, "reservation",
                    customerOwner ? "customer-owner" : employeeOwner ? "assigned-employee" : "unrelated");
            throw new ApplicationException(HttpStatus.FORBIDDEN,
                    "This reservation action is not permitted");
        }
    }

    public boolean canTransition(
            AuthenticatedUser actor, Reservation reservation, ReservationStatus target) {
        boolean management = actor.role() == Role.ADMIN || actor.role() == Role.OWNER;
        boolean employeeOwner = actor.role() == Role.EMPLOYEE
                && actor.id().equals(reservation.getEmployeeId());
        boolean customerOwner = actor.role() == Role.CUSTOMER
                && actor.id().equals(reservation.getCustomerId());
        return switch (target) {
            case CONFIRMED, REJECTED, COMPLETED -> management || employeeOwner;
            case CANCELLED -> management || customerOwner;
            case PENDING -> false;
        };
    }
}
