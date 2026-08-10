package com.game_manager.gm.dashboard;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.dashboard.dto.DashboardSummaryResponse;
import com.game_manager.gm.dashboard.dto.DashboardTodayResponse;
import com.game_manager.gm.dashboard.dto.DashboardMetricResponse;
import com.game_manager.gm.dashboard.dto.DashboardTrendBucketResponse;
import com.game_manager.gm.dashboard.dto.DashboardTrendsResponse;
import com.game_manager.gm.dashboard.dto.DashboardWidgetPreferenceRequest;
import com.game_manager.gm.dashboard.dto.DashboardWidgetPreferenceResponse;
import com.game_manager.gm.dashboard.dto.DashboardWorkloadItemResponse;
import com.game_manager.gm.dashboard.dto.DashboardWorkloadResponse;
import com.game_manager.gm.order.OrderAnalyticsRow;
import com.game_manager.gm.order.OrderRevenueTotal;
import com.game_manager.gm.order.OrderService;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.reservation.ReservationService;
import com.game_manager.gm.reservation.ReservationStatus;
import com.game_manager.gm.reservation.ReservationStatusTotal;
import com.game_manager.gm.reservation.ReservationAnalyticsRow;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.EnumMap;
import java.util.Map;
import java.util.stream.Collectors;
import com.game_manager.gm.user.UserService;
import com.game_manager.gm.workinghours.WorkingHoursService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DashboardService {
    private final ReservationService reservationService;
    private final OrderService orderService;
    private final CurrentUserProvider currentUserProvider;
    private final Clock clock;
    private final GManagerProperties properties;
    private final UserService userService;
    private final WorkingHoursService workingHoursService;
    private final DashboardWidgetPreferenceRepository widgetPreferences;
    private final MeterRegistry meterRegistry;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('DASHBOARD_SUMMARY')")
    public DashboardSummaryResponse summary(LocalDate from, LocalDate to) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() != Role.OWNER && actor.role() != Role.ADMIN) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Dashboard summary is not permitted");
        }
        validateRange(from, to);
        ZoneId businessZone = properties.businessZone();
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
    @PreAuthorize("hasAuthority('DASHBOARD_OPERATIONAL')")
    public DashboardTodayResponse today() {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        if (actor.role() == Role.CUSTOMER) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Operational dashboard is not permitted");
        }
        ZoneId businessZone = properties.businessZone();
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

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('DASHBOARD_SUMMARY')")
    public DashboardTrendsResponse trends(LocalDate from, LocalDate to) {
        requireManagement();
        validateRange(from, to);
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            return calculateTrends(from, to);
        } finally {
            sample.stop(meterRegistry.timer("gm.dashboard.query.duration", "query", "trends"));
            meterRegistry.summary("gm.dashboard.range.days", "query", "trends")
                    .record(ChronoUnit.DAYS.between(from, to) + 1);
        }
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('DASHBOARD_SUMMARY')")
    public DashboardWorkloadResponse workload(LocalDate from, LocalDate to, UUID employeeId) {
        requireManagement();
        validateRange(from, to);
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            var employees = userService.activeEmployeesForAnalytics().stream()
                    .filter(item -> employeeId == null || item.id().equals(employeeId)).toList();
            if (employeeId != null && employees.isEmpty()) {
                throw new ApplicationException(HttpStatus.NOT_FOUND, "Active employee not found");
            }
            ZoneId zone = properties.businessZone();
            Instant start = from.atStartOfDay(zone).toInstant();
            Instant end = to.plusDays(1).atStartOfDay(zone).toInstant();
            Map<UUID, List<ReservationAnalyticsRow>> rows = reservationService.analyticsBetween(start, end, employeeId)
                    .stream().filter(row -> row.status() == ReservationStatus.CONFIRMED
                            || row.status() == ReservationStatus.COMPLETED)
                    .collect(Collectors.groupingBy(ReservationAnalyticsRow::employeeId));
            long capacity = workingHoursService.capacityMinutes(from, to);
            List<DashboardWorkloadItemResponse> result = employees.stream().map(employee -> {
                List<ReservationAnalyticsRow> assigned = rows.getOrDefault(employee.id(), List.of());
                long used = assigned.stream().mapToLong(row -> Duration.between(row.startTime(), row.endTime()).toMinutes()).sum();
                BigDecimal utilization = capacity == 0 ? null
                        : BigDecimal.valueOf(used * 100.0 / capacity).setScale(2, RoundingMode.HALF_UP);
                return new DashboardWorkloadItemResponse(employee.id(), employee.name(), assigned.size(), used, capacity, utilization);
            }).toList();
            return new DashboardWorkloadResponse(from, to, zone.getId(),
                    "CONFIRMED + COMPLETED reservation minutes / configured business minutes", result);
        } finally {
            sample.stop(meterRegistry.timer("gm.dashboard.query.duration", "query", "workload"));
        }
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('DASHBOARD_SUMMARY')")
    public byte[] export(LocalDate from, LocalDate to, UUID employeeId, boolean raw) {
        requireManagement();
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            DashboardTrendsResponse trends = calculateTrendsAfterValidation(from, to);
            DashboardWorkloadResponse workload = workload(from, to, employeeId);
            StringBuilder csv = new StringBuilder("section,date,label,revenue,orders,reservations,reserved_minutes,capacity_minutes,utilization_percent\r\n");
            if (raw) {
                trends.buckets().forEach(bucket -> csv.append("trend,").append(bucket.date()).append(",,")
                        .append(bucket.completedRevenue()).append(',').append(bucket.completedOrders()).append(',')
                        .append(bucket.reservations()).append(",,,\r\n"));
            } else {
                csv.append("summary,").append(from).append("/").append(to).append(",current,")
                        .append(trends.revenue().current()).append(',').append(trends.completedOrders().current())
                        .append(',').append(trends.reservations().current()).append(",,,\r\n");
            }
            workload.employees().forEach(item -> csv.append("workload,,\"")
                    .append(item.employeeName().replace("\"", "\"\"")).append("\",,,,")
                    .append(item.reservedMinutes()).append(',').append(item.capacityMinutes()).append(',')
                    .append(item.utilizationPercent()).append("\r\n"));
            meterRegistry.counter("gm.dashboard.exports", "view", raw ? "raw" : "current").increment();
            return csv.toString().getBytes(StandardCharsets.UTF_8);
        } finally {
            sample.stop(meterRegistry.timer("gm.dashboard.export.duration"));
        }
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('DASHBOARD_SUMMARY')")
    public List<DashboardWidgetPreferenceResponse> widgetPreferences() {
        UUID owner = currentUserProvider.requireCurrentUser().id();
        return widgetPreferences.findByOwnerIdOrderByPositionAsc(owner).stream().map(this::widgetResponse).toList();
    }

    @Transactional
    @PreAuthorize("hasAuthority('DASHBOARD_SUMMARY')")
    public List<DashboardWidgetPreferenceResponse> saveWidgetPreferences(List<DashboardWidgetPreferenceRequest> requests) {
        UUID owner = currentUserProvider.requireCurrentUser().id();
        if (requests.stream().map(DashboardWidgetPreferenceRequest::widgetKey).distinct().count() != requests.size()) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Widget keys must be unique");
        }
        for (DashboardWidgetPreferenceRequest request : requests) {
            DashboardWidgetPreference item = widgetPreferences.findByOwnerIdAndWidgetKey(owner, request.widgetKey())
                    .orElseGet(DashboardWidgetPreference::new);
            item.setOwnerId(owner); item.setWidgetKey(request.widgetKey()); item.setPosition(request.position());
            item.setVisible(request.visible()); item.setThreshold(request.threshold()); widgetPreferences.save(item);
        }
        return widgetPreferences();
    }

    private DashboardTrendsResponse calculateTrendsAfterValidation(LocalDate from, LocalDate to) {
        validateRange(from, to);
        return calculateTrends(from, to);
    }

    private DashboardTrendsResponse calculateTrends(LocalDate from, LocalDate to) {
        ZoneId zone = properties.businessZone();
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        LocalDate previousTo = from.minusDays(1);
        LocalDate previousFrom = previousTo.minusDays(days - 1);
        Instant currentStart = from.atStartOfDay(zone).toInstant();
        Instant currentEnd = to.plusDays(1).atStartOfDay(zone).toInstant();
        Instant previousStart = previousFrom.atStartOfDay(zone).toInstant();
        List<OrderAnalyticsRow> currentOrders = orderService.analyticsBetween(currentStart, currentEnd);
        List<OrderAnalyticsRow> previousOrders = orderService.analyticsBetween(previousStart, currentStart);
        List<ReservationAnalyticsRow> currentReservations = reservationService.analyticsBetween(currentStart, currentEnd, null);
        List<ReservationAnalyticsRow> previousReservations = reservationService.analyticsBetween(previousStart, currentStart, null);
        BigDecimal currentRevenue = revenue(currentOrders); BigDecimal previousRevenue = revenue(previousOrders);
        long currentCompleted = completed(currentOrders); long previousCompleted = completed(previousOrders);
        Map<ReservationStatus, Long> statuses = new EnumMap<>(ReservationStatus.class);
        for (ReservationStatus status : ReservationStatus.values()) statuses.put(status, 0L);
        currentReservations.forEach(row -> statuses.compute(row.status(), (ignored, count) -> count + 1));
        Map<LocalDate, DashboardTrendBucketResponse> buckets = new java.util.LinkedHashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1))
            buckets.put(date, new DashboardTrendBucketResponse(date, BigDecimal.ZERO, 0, 0));
        currentOrders.stream().filter(row -> row.status() == OrderStatus.COMPLETED).forEach(row -> {
            LocalDate date = row.createdAt().atZone(zone).toLocalDate(); var old = buckets.get(date);
            buckets.put(date, new DashboardTrendBucketResponse(date, old.completedRevenue().add(row.totalPrice()), old.completedOrders() + 1, old.reservations()));
        });
        currentReservations.forEach(row -> { LocalDate date = row.startTime().atZone(zone).toLocalDate(); var old = buckets.get(date);
            buckets.put(date, new DashboardTrendBucketResponse(date, old.completedRevenue(), old.completedOrders(), old.reservations() + 1)); });
        return new DashboardTrendsResponse(from, to, previousFrom, previousTo, zone.getId(), "DAY",
                metric(currentRevenue, previousRevenue), metric(BigDecimal.valueOf(currentCompleted), BigDecimal.valueOf(previousCompleted)),
                metric(BigDecimal.valueOf(currentReservations.size()), BigDecimal.valueOf(previousReservations.size())), statuses,
                new ArrayList<>(buckets.values()));
    }

    private static BigDecimal revenue(List<OrderAnalyticsRow> rows) { return rows.stream()
            .filter(row -> row.status() == OrderStatus.COMPLETED).map(OrderAnalyticsRow::totalPrice)
            .reduce(BigDecimal.ZERO, BigDecimal::add); }
    private static long completed(List<OrderAnalyticsRow> rows) { return rows.stream().filter(row -> row.status() == OrderStatus.COMPLETED).count(); }
    private static DashboardMetricResponse metric(BigDecimal current, BigDecimal previous) {
        BigDecimal delta = current.subtract(previous);
        BigDecimal percent = previous.signum() == 0 ? null : delta.multiply(BigDecimal.valueOf(100)).divide(previous, 2, RoundingMode.HALF_UP);
        return new DashboardMetricResponse(current, previous, delta, percent);
    }
    private DashboardWidgetPreferenceResponse widgetResponse(DashboardWidgetPreference item) {
        return new DashboardWidgetPreferenceResponse(item.getWidgetKey(), item.getPosition(), item.isVisible(), item.getThreshold());
    }
    private void requireManagement() {
        Role role = currentUserProvider.requireCurrentUser().role();
        if (role != Role.OWNER && role != Role.ADMIN) throw new ApplicationException(HttpStatus.FORBIDDEN, "Dashboard summary is not permitted");
    }

    private static void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Date range is required");
        }
        if (from.isAfter(to)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Date range is not valid");
        }
        if (ChronoUnit.DAYS.between(from, to) > 365) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Dashboard date range cannot exceed 366 days");
        }
    }
}
