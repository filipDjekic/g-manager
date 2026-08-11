package com.game_manager.gm.reservation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.AuthorizationDenialLogger;
import com.game_manager.gm.common.security.Role;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ReservationTransitionPolicyTest {
    private static final Instant NOW = Instant.parse("2028-03-16T10:00:00Z");
    private final UUID customerId = UUID.randomUUID();
    private final UUID employeeId = UUID.randomUUID();
    private final ReservationTransitionPolicy policy = policy();

    @Test
    void actionMatrixIsRoleStateAndTimeAware() {
        Reservation pending = reservation(ReservationStatus.PENDING,
                NOW.plusSeconds(7200), NOW.plusSeconds(9000));
        assertThat(policy.allowedActions(actor(Role.CUSTOMER, customerId), pending))
                .containsExactly(ReservationStatus.CANCELLED);
        assertThat(policy.allowedActions(actor(Role.EMPLOYEE, employeeId), pending))
                .containsExactly(ReservationStatus.CONFIRMED, ReservationStatus.REJECTED);
        assertThat(policy.allowedActions(actor(Role.ADMIN, UUID.randomUUID()), pending))
                .containsExactly(ReservationStatus.CONFIRMED, ReservationStatus.REJECTED,
                        ReservationStatus.CANCELLED);

        Reservation confirmed = reservation(ReservationStatus.CONFIRMED,
                NOW.plusSeconds(7200), NOW.plusSeconds(9000));
        assertThat(policy.allowedActions(actor(Role.CUSTOMER, customerId), confirmed))
                .containsExactly(ReservationStatus.CANCELLED);
        assertThat(policy.allowedActions(actor(Role.EMPLOYEE, employeeId), confirmed)).isEmpty();
        assertThat(policy.allowedActions(actor(Role.ADMIN, UUID.randomUUID()), confirmed))
                .containsExactly(ReservationStatus.CANCELLED);

        Reservation elapsed = reservation(ReservationStatus.CONFIRMED,
                NOW.minusSeconds(7200), NOW.minusSeconds(3600));
        assertThat(policy.allowedActions(actor(Role.EMPLOYEE, employeeId), elapsed))
                .containsExactly(ReservationStatus.COMPLETED);
        assertThat(policy.allowedActions(actor(Role.ADMIN, UUID.randomUUID()), elapsed))
                .containsExactly(ReservationStatus.COMPLETED, ReservationStatus.CANCELLED);

        for (ReservationStatus terminal : List.of(
                ReservationStatus.REJECTED, ReservationStatus.CANCELLED, ReservationStatus.COMPLETED)) {
            assertThat(policy.allowedActions(actor(Role.ADMIN, UUID.randomUUID()),
                    reservation(terminal, NOW.plusSeconds(7200), NOW.plusSeconds(9000)))).isEmpty();
        }
    }

    @Test
    void backendRejectsUnauthorizedIllegalUntimelyAndReasonlessTransitions() {
        Reservation pending = reservation(ReservationStatus.PENDING,
                NOW.plusSeconds(7200), NOW.plusSeconds(9000));
        assertFailure(HttpStatus.FORBIDDEN, () -> policy.requireTransition(
                actor(Role.EMPLOYEE, UUID.randomUUID()), pending, ReservationStatus.CONFIRMED, null));
        assertFailure(HttpStatus.CONFLICT, () -> policy.requireTransition(
                actor(Role.ADMIN, UUID.randomUUID()), pending, ReservationStatus.COMPLETED, null));
        assertFailure(HttpStatus.UNPROCESSABLE_ENTITY, () -> policy.requireTransition(
                actor(Role.ADMIN, UUID.randomUUID()), pending, ReservationStatus.REJECTED, " "));

        Reservation near = reservation(ReservationStatus.CONFIRMED,
                NOW.plusSeconds(1800), NOW.plusSeconds(3600));
        assertFailure(HttpStatus.CONFLICT, () -> policy.requireTransition(
                actor(Role.CUSTOMER, customerId), near, ReservationStatus.CANCELLED, "Plan changed"));
        assertFailure(HttpStatus.CONFLICT, () -> policy.requireTransition(
                actor(Role.EMPLOYEE, employeeId), near, ReservationStatus.COMPLETED, null));
    }

    private ReservationTransitionPolicy policy() {
        GManagerProperties properties = mock(GManagerProperties.class);
        when(properties.reservations()).thenReturn(new GManagerProperties.Reservations(60));
        return new ReservationTransitionPolicy(mock(AuthorizationDenialLogger.class), properties,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private Reservation reservation(ReservationStatus status, Instant start, Instant end) {
        Reservation value = new Reservation();
        value.setCustomerId(customerId); value.setEmployeeId(employeeId);
        value.setStatus(status); value.setStartTime(start); value.setEndTime(end);
        return value;
    }

    private AuthenticatedUser actor(Role role, UUID id) {
        return new AuthenticatedUser(id, role.name().toLowerCase() + "@example.test", role);
    }

    private void assertFailure(HttpStatus status, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ApplicationException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(status));
    }
}
