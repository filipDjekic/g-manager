package com.game_manager.gm.dashboard;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.dashboard.dto.DashboardSummaryResponse;
import com.game_manager.gm.dashboard.dto.DashboardTodayResponse;
import com.game_manager.gm.order.OrderRevenueTotal;
import com.game_manager.gm.order.OrderService;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.reservation.ReservationService;
import com.game_manager.gm.reservation.ReservationStatus;
import com.game_manager.gm.reservation.ReservationStatusTotal;
import com.game_manager.gm.security.AuthenticatedUser;
import com.game_manager.gm.security.CurrentUserProvider;
import com.game_manager.gm.user.Role;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DashboardService {
    private final ReservationService reservationService;
    private final OrderService orderService;
    private final CurrentUserProvider currentUserProvider;
    private final Clock clock;

    @Value("${app.business-zone:Europe/Belgrade}")
    private ZoneId businessZone;

    @Transactional(readOnly = true)
    public DashboardSummaryResponse summary(LocalDate from, LocalDate to) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.OWNER && actor.role() != Role.ADMIN) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Dashboard summary is not permitted");
        }
        validateRange(from, to);
        Instant fromInstant = from.atStartOfDay(businessZone).toInstant();
        Instant toInstant = to.plusDays(1).atStartOfDay(businessZone).toInstant();
        OrderRevenueTotal revenue = orderService.completedRevenueBetween(fromInstant, toInstant);
        Map<ReservationStatus, Long> counts = new EnumMap<>(ReservationStatus.class);
        for (ReservationStatus status : ReservationStatus.values()) {
            counts.put(status, 0L);
        }
        for (ReservationStatusTotal total :
                reservationService.countByStatusBetween(fromInstant, toInstant)) {
            counts.put(total.status(), total.total());
        }
        return new DashboardSummaryResponse(
                revenue.totalRevenueCompleted(), revenue.completedOrdersCount(), counts);
    }

    @Transactional(readOnly = true)
    public DashboardTodayResponse today() {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() == Role.CUSTOMER) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Operational dashboard is not permitted");
        }
        LocalDate today = LocalDate.now(clock.withZone(businessZone));
        Instant from = today.atStartOfDay(businessZone).toInstant();
        Instant to = today.plusDays(1).atStartOfDay(businessZone).toInstant();
        return new DashboardTodayResponse(
                reservationService.countForEmployeeToday(
                        actor.id(), ReservationStatus.PENDING, from, to),
                reservationService.countForEmployeeToday(
                        actor.id(), ReservationStatus.CONFIRMED, from, to),
                orderService.countByStatusToday(OrderStatus.CREATED, null, from, to),
                orderService.countByStatusToday(OrderStatus.IN_PROGRESS, actor.id(), from, to));
    }

    private static void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Date range is required");
        }
        if (from.isAfter(to)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Date range is not valid");
        }
    }
}
