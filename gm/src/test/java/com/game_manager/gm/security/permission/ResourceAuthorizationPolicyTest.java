package com.game_manager.gm.security.permission;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.AuthorizationDenialLogger;
import com.game_manager.gm.order.Order;
import com.game_manager.gm.order.OrderAuthorizationPolicy;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.reservation.Reservation;
import com.game_manager.gm.reservation.ReservationAuthorizationPolicy;
import com.game_manager.gm.reservation.ReservationStatus;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserAuthorizationPolicy;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ResourceAuthorizationPolicyTest {
    private final AuthorizationDenialLogger logger = new AuthorizationDenialLogger();
    private final OrderAuthorizationPolicy orders = new OrderAuthorizationPolicy(logger);
    private final ReservationAuthorizationPolicy reservations =
            new ReservationAuthorizationPolicy(logger);
    private final UserAuthorizationPolicy users = new UserAuthorizationPolicy(logger);

    @Test
    void customerCanCancelOnlyTheirOwnOrder() {
        UUID customerId = UUID.randomUUID();
        Order own = order(customerId, null, OrderStatus.CREATED);
        Order foreign = order(UUID.randomUUID(), null, OrderStatus.CREATED);
        AuthenticatedUser customer = actor(customerId, Role.CUSTOMER);

        assertThatCode(() -> orders.requireTransition(customer, own, OrderStatus.CANCELLED))
                .doesNotThrowAnyException();
        assertForbidden(() -> orders.requireTransition(customer, foreign, OrderStatus.CANCELLED));
    }

    @Test
    void employeeCanAdvanceOnlyAnOrderTheyHandle() {
        UUID employeeId = UUID.randomUUID();
        AuthenticatedUser employee = actor(employeeId, Role.EMPLOYEE);

        assertThatCode(() -> orders.requireTransition(employee,
                order(UUID.randomUUID(), employeeId, OrderStatus.IN_PROGRESS), OrderStatus.READY))
                .doesNotThrowAnyException();
        assertForbidden(() -> orders.requireTransition(employee,
                order(UUID.randomUUID(), UUID.randomUUID(), OrderStatus.IN_PROGRESS), OrderStatus.READY));
    }

    @Test
    void reservationOwnershipAndAssignmentAreEnforced() {
        UUID customerId = UUID.randomUUID();
        UUID employeeId = UUID.randomUUID();
        Reservation reservation = reservation(customerId, employeeId);

        assertThatCode(() -> reservations.requireTransition(
                actor(customerId, Role.CUSTOMER), reservation, ReservationStatus.CANCELLED))
                .doesNotThrowAnyException();
        assertThatCode(() -> reservations.requireTransition(
                actor(employeeId, Role.EMPLOYEE), reservation, ReservationStatus.CONFIRMED))
                .doesNotThrowAnyException();
        assertForbidden(() -> reservations.requireTransition(
                actor(UUID.randomUUID(), Role.CUSTOMER), reservation, ReservationStatus.CANCELLED));
        assertForbidden(() -> reservations.requireTransition(
                actor(UUID.randomUUID(), Role.EMPLOYEE), reservation, ReservationStatus.CONFIRMED));
    }

    @Test
    void ownerProtectionAndSelfEscalationRulesAreCentralized() {
        AuthenticatedUser admin = actor(UUID.randomUUID(), Role.ADMIN);
        AuthenticatedUser owner = actor(UUID.randomUUID(), Role.OWNER);
        User ownerTarget = user(owner.id(), Role.OWNER);

        assertForbidden(() -> users.requireCreatableRole(admin, Role.ADMIN));
        assertThatCode(() -> users.requireCreatableRole(owner, Role.ADMIN)).doesNotThrowAnyException();
        assertForbidden(() -> users.requireDeactivation(admin, ownerTarget));
        assertThatThrownBy(() -> users.requireDeactivation(owner, ownerTarget))
                .isInstanceOf(ApplicationException.class)
                .extracting(exception -> ((ApplicationException) exception).getStatus().value())
                .isEqualTo(409);
    }

    private void assertForbidden(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action)
                .isInstanceOf(ApplicationException.class)
                .extracting(exception -> ((ApplicationException) exception).getStatus().value())
                .isEqualTo(403);
    }

    private AuthenticatedUser actor(UUID id, Role role) {
        return new AuthenticatedUser(id, role.name().toLowerCase() + "@example.test", role);
    }

    private Order order(UUID customerId, UUID handlerId, OrderStatus status) {
        Order order = new Order();
        order.setCustomerId(customerId);
        order.setHandledBy(handlerId);
        order.setStatus(status);
        return order;
    }

    private Reservation reservation(UUID customerId, UUID employeeId) {
        Reservation reservation = new Reservation();
        reservation.setCustomerId(customerId);
        reservation.setEmployeeId(employeeId);
        reservation.setStatus(ReservationStatus.PENDING);
        return reservation;
    }

    private User user(UUID id, Role role) {
        User user = new User();
        user.setId(id);
        user.setRole(role);
        return user;
    }
}
