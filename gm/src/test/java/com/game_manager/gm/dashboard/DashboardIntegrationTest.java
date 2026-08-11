package com.game_manager.gm.dashboard;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.order.Order;
import com.game_manager.gm.order.OrderRepository;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.reservation.Reservation;
import com.game_manager.gm.reservation.ReservationRepository;
import com.game_manager.gm.reservation.ReservationStatus;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("Europe/Belgrade");

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private ReservationRepository reservationRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private CatalogRepository catalogRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void managementSummaryUsesDatabaseAggregatesAndReturnsAllStatuses() throws Exception {
        User admin = createUser(Role.ADMIN);
        User customer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        LocalDate today = LocalDate.now(ZONE);
        String url = "/api/v1/dashboard/summary?from=%s&to=%s".formatted(today, today);
        JsonNode baseline = json(mockMvc.perform(get(url)
                        .header("Authorization", bearer(login(admin))))
                .andExpect(status().isOk()).andReturn());

        createOrder(customer, OrderStatus.COMPLETED, new BigDecimal("1250.50"), null);
        createOrder(customer, OrderStatus.COMPLETED, new BigDecimal("249.50"), null);
        createOrder(customer, OrderStatus.CANCELLED, new BigDecimal("9999.00"), null);
        createReservation(customer, employee, ReservationStatus.PENDING);
        createReservation(customer, employee, ReservationStatus.COMPLETED);

        JsonNode result = json(mockMvc.perform(get(url)
                        .header("Authorization", bearer(login(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reservationsByStatus.CONFIRMED").exists())
                .andExpect(jsonPath("$.reservationsByStatus.REJECTED").exists())
                .andExpect(jsonPath("$.reservationsByStatus.CANCELLED").exists())
                .andReturn());
        assertThat(result.get("completedOrdersCount").asLong())
                .isEqualTo(baseline.get("completedOrdersCount").asLong() + 2);
        assertThat(result.get("totalRevenueCompleted").decimalValue())
                .isEqualByComparingTo(
                        baseline.get("totalRevenueCompleted").decimalValue()
                                .add(new BigDecimal("1500.00")));
        assertThat(result.at("/reservationsByStatus/PENDING").asLong())
                .isEqualTo(baseline.at("/reservationsByStatus/PENDING").asLong() + 1);
        assertThat(result.at("/reservationsByStatus/COMPLETED").asLong())
                .isEqualTo(baseline.at("/reservationsByStatus/COMPLETED").asLong() + 1);
    }

    @Test
    void operationalTodayIsEmployeeScopedExceptForUnclaimedOrders() throws Exception {
        User employee = createUser(Role.EMPLOYEE);
        User otherEmployee = createUser(Role.EMPLOYEE);
        User customer = createUser(Role.CUSTOMER);
        JsonNode baseline = json(mockMvc.perform(get("/api/v1/dashboard/today")
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isOk()).andReturn());

        Reservation pending = createReservation(customer, employee, ReservationStatus.PENDING);
        createReservation(customer, employee, ReservationStatus.CONFIRMED);
        createReservation(customer, otherEmployee, ReservationStatus.CONFIRMED);
        createOrder(customer, OrderStatus.CREATED, new BigDecimal("100.00"), null);
        createOrder(customer, OrderStatus.IN_PROGRESS, new BigDecimal("200.00"), employee.getId());

        JsonNode result = json(mockMvc.perform(get("/api/v1/dashboard/today")
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isOk()).andReturn());
        assertThat(result.get("date").asText()).isEqualTo(LocalDate.now(ZONE).toString());
        assertThat(result.get("timezone").asText()).isEqualTo("Europe/Belgrade");
        assertThat(result.get("appointments").size()).isEqualTo(baseline.get("appointments").size() + 2);
        assertThat(result.get("appointments").toString()).contains(pending.getId().toString())
                .contains(customer.getName()).contains("CONFIRMED");
        assertThat(result.get("appointments").toString()).doesNotContain(otherEmployee.getId().toString());
        assertThat(result.get("appointments").toString()).contains("allowedActions");
        assertThat(result.get("unclaimedOrders").size()).isEqualTo(baseline.get("unclaimedOrders").size() + 1);
        assertThat(result.get("assignedOrders").size()).isEqualTo(baseline.get("assignedOrders").size() + 1);
        assertThat(result.at("/unclaimedOrders/0/allowedActions").toString()).contains("IN_PROGRESS");
        assertThat(result.toString()).contains("gaps").contains("attentionNotifications");
    }

    @Test
    void roleAndDateRangeValidationAreEnforced() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        LocalDate today = LocalDate.now(ZONE);

        mockMvc.perform(get("/api/v1/dashboard/today")
                        .header("Authorization", bearer(login(customer))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/dashboard/summary?from={from}&to={to}",
                        today, today)
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/dashboard/summary?from={from}&to={to}",
                        today, today.minusDays(1))
                        .header("Authorization", bearer(login(createUser(Role.ADMIN)))))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/dashboard/trends?from={from}&to={to}",
                        today.minusDays(367), today)
                        .header("Authorization", bearer(login(createUser(Role.OWNER)))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void trendsComparisonBucketsDrilldownTotalsAndCsvUseTheSameBusinessRange() throws Exception {
        User owner = createUser(Role.OWNER); User customer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        LocalDate current = LocalDate.now(ZONE).minusDays(3); LocalDate previous = current.minusDays(1);
        Instant currentInstant = current.atTime(12, 0).atZone(ZONE).toInstant();
        Instant previousInstant = previous.atTime(12, 0).atZone(ZONE).toInstant();
        Order currentOrder = createOrder(customer, OrderStatus.COMPLETED, new BigDecimal("300.00"), null);
        jdbcTemplate.update("update orders set created_at = ? where id = ?", currentInstant, currentOrder.getId());
        Order previousOrder = createOrder(customer, OrderStatus.COMPLETED, new BigDecimal("100.00"), null);
        jdbcTemplate.update("update orders set created_at = ? where id = ?", previousInstant, previousOrder.getId());
        Reservation reservation = createReservation(customer, employee, ReservationStatus.CONFIRMED);
        reservation.setStartTime(currentInstant); reservation.setEndTime(currentInstant.plus(90, ChronoUnit.MINUTES));
        reservationRepository.saveAndFlush(reservation);
        String token = bearer(login(owner));

        mockMvc.perform(get("/api/v1/dashboard/trends").queryParam("from", current.toString()).queryParam("to", current.toString())
                        .header("Authorization", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.timezone").value("Europe/Belgrade"))
                .andExpect(jsonPath("$.previousFrom").value(previous.toString()))
                .andExpect(jsonPath("$.revenue.current").value(300.0))
                .andExpect(jsonPath("$.revenue.previous").value(100.0))
                .andExpect(jsonPath("$.revenue.percentChange").value(200.0))
                .andExpect(jsonPath("$.buckets[0].completedOrders").value(1))
                .andExpect(jsonPath("$.buckets[0].reservations").value(1))
                .andExpect(jsonPath("$.reservationsByStatus.CONFIRMED").value(1));
        mockMvc.perform(get("/api/v1/dashboard/workload").queryParam("from", current.toString()).queryParam("to", current.toString())
                        .queryParam("employeeId", employee.getId().toString()).header("Authorization", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.employees[0].reservedMinutes").value(90));
        mockMvc.perform(get("/api/v1/dashboard/export").queryParam("from", current.toString()).queryParam("to", current.toString())
                        .queryParam("view", "raw").header("Authorization", token))
                .andExpect(status().isOk()).andExpect(result -> assertThat(result.getResponse().getContentAsString())
                        .contains("trend," + current).contains(",300.00,1,1,"));
    }

    @Test
    void dashboardPreferencesAreOwnerIsolatedAndNewApisRejectOperationalRole() throws Exception {
        User owner = createUser(Role.OWNER); User admin = createUser(Role.ADMIN); User employee = createUser(Role.EMPLOYEE);
        String ownerToken = bearer(login(owner)); String adminToken = bearer(login(admin));
        String payload = "[{\"widgetKey\":\"workload\",\"position\":0,\"visible\":true,\"threshold\":75}]";
        mockMvc.perform(put("/api/v1/dashboard/widget-preferences").header("Authorization", ownerToken)
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].threshold").value(75));
        mockMvc.perform(get("/api/v1/dashboard/widget-preferences").header("Authorization", adminToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        LocalDate today = LocalDate.now(ZONE);
        for (String path : java.util.List.of("trends", "workload", "export")) {
            mockMvc.perform(get("/api/v1/dashboard/" + path).queryParam("from", today.toString()).queryParam("to", today.toString())
                            .header("Authorization", bearer(login(employee))))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void attentionDefinesCurrentMetricsAndAuthorizedDrillDowns() throws Exception {
        User owner = createUser(Role.OWNER);
        User employee = createUser(Role.EMPLOYEE);
        User customer = createUser(Role.CUSTOMER);
        Reservation pending = createReservation(customer, employee, ReservationStatus.PENDING);
        createReservation(customer, employee, ReservationStatus.CANCELLED);
        createReservation(customer, employee, ReservationStatus.CONFIRMED);
        jdbcTemplate.update("update working_hours set active=true, open_time=?, close_time=? where day_of_week=?",
                java.sql.Time.valueOf("08:00:00"), java.sql.Time.valueOf("20:00:00"),
                LocalDate.now(ZONE).getDayOfWeek().name());
        createOrder(customer, OrderStatus.CREATED, new BigDecimal("100.00"), null);
        createOrder(customer, OrderStatus.IN_PROGRESS, new BigDecimal("200.00"), employee.getId());
        String ownerToken = bearer(login(owner));
        mockMvc.perform(put("/api/v1/dashboard/widget-preferences").header("Authorization", ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"widgetKey\":\"workload\",\"position\":0,\"visible\":true,\"threshold\":0}]"))
                .andExpect(status().isOk());

        JsonNode result = json(mockMvc.perform(get("/api/v1/dashboard/attention")
                        .header("Authorization", ownerToken))
                .andExpect(status().isOk()).andReturn());
        assertThat(result.get("timezone").asText()).isEqualTo("Europe/Belgrade");
        assertThat(result.get("workloadThresholdPercent").asInt()).isZero();
        java.util.List<String> keys = new java.util.ArrayList<>();
        result.get("items").forEach(item -> {
            keys.add(item.get("key").asText());
            assertThat(item.get("url").asText()).startsWith("/");
            assertThat(item.get("detail").asText()).isNotBlank();
        });
        assertThat(keys).contains("pending-today", "cancelled-today", "orders-unclaimed", "orders-in-progress");
        assertThat(keys).contains("next-" + pending.getId(), "workload-" + employee.getId());

        mockMvc.perform(get("/api/v1/dashboard/attention")
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isForbidden());
    }

    private Reservation createReservation(
            User customer, User employee, ReservationStatus status) {
        Reservation reservation = new Reservation();
        reservation.setCustomerId(customer.getId());
        reservation.setEmployeeId(employee.getId());
        reservation.setServiceId(createService().getId());
        reservation.setStartTime(Instant.now().plus(1, ChronoUnit.HOURS));
        reservation.setEndTime(Instant.now().plus(2, ChronoUnit.HOURS));
        reservation.setStatus(status);
        return reservationRepository.saveAndFlush(reservation);
    }

    private CatalogItem createService() {
        CatalogItem service = new CatalogItem();
        service.setName("Dashboard service " + UUID.randomUUID());
        service.setType(ItemType.SERVICE);
        service.setPrice(new BigDecimal("100.00"));
        service.setDurationMinutes(60);
        service.setActive(true);
        return catalogRepository.saveAndFlush(service);
    }

    private Order createOrder(
            User customer, OrderStatus status, BigDecimal total, UUID handledBy) {
        Order order = new Order();
        order.setCustomerId(customer.getId());
        order.setStatus(status);
        order.setHandledBy(handledBy);
        order.setTotalPrice(total);
        return orderRepository.saveAndFlush(order);
    }

    private User createUser(Role role) {
        User user = new User();
        user.setName(role + " Dashboard User");
        user.setEmail(role.name().toLowerCase() + "-dashboard-" + UUID.randomUUID() + "@example.com");
        user.setPasswordHash(passwordEncoder.encode("StrongPass1!"));
        user.setRole(role);
        user.setActive(true);
        return userRepository.saveAndFlush(user);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}"
                                .formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return json(result).get("token").asText();
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsByteArray());
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
