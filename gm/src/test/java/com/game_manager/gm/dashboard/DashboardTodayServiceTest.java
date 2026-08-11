package com.game_manager.gm.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.notification.NotificationService;
import com.game_manager.gm.order.OrderService;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.reservation.ReservationService;
import com.game_manager.gm.user.UserService;
import com.game_manager.gm.workinghours.WorkingHoursService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DashboardTodayServiceTest {
    @Test
    void todayUsesAuthenticatedEmployeeAndDstAwareBusinessMidnights() {
        UUID employeeId = UUID.randomUUID();
        ReservationService reservations = mock(ReservationService.class);
        OrderService orders = mock(OrderService.class);
        NotificationService notifications = mock(NotificationService.class);
        CurrentUserProvider currentUser = mock(CurrentUserProvider.class);
        GManagerProperties properties = mock(GManagerProperties.class);
        WorkingHoursService hours = mock(WorkingHoursService.class);
        ZoneId zone = ZoneId.of("Europe/Belgrade");
        LocalDate date = LocalDate.of(2026, 3, 29);
        Instant from = Instant.parse("2026-03-28T23:00:00Z");
        Instant to = Instant.parse("2026-03-29T22:00:00Z");
        when(currentUser.requireCurrentUser()).thenReturn(
                new AuthenticatedUser(employeeId, "employee@example.test", Role.EMPLOYEE));
        when(properties.businessZone()).thenReturn(zone);
        when(reservations.calendar(employeeId, date, date)).thenReturn(List.of());
        when(orders.operationalOrders(OrderStatus.CREATED, null, true, 10)).thenReturn(List.of());
        when(orders.operationalOrders(OrderStatus.IN_PROGRESS, employeeId, false, 10)).thenReturn(List.of());
        when(notifications.attentionBetween(from, to, 10)).thenReturn(List.of());

        DashboardService service = new DashboardService(reservations, orders, notifications, currentUser,
                Clock.fixed(Instant.parse("2026-03-29T00:30:00Z"), ZoneOffset.UTC), properties,
                mock(UserService.class), hours, mock(DashboardWidgetPreferenceRepository.class),
                new SimpleMeterRegistry());
        var result = service.today();

        assertThat(result.date()).isEqualTo(date);
        assertThat(result.timezone()).isEqualTo("Europe/Belgrade");
        assertThat(java.time.Duration.between(from, to).toHours()).isEqualTo(23);
        verify(reservations).calendar(employeeId, date, date);
        verify(notifications).attentionBetween(from, to, 10);
    }
}
