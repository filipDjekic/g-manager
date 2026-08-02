package com.game_manager.gm.dashboard;

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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
    @Autowired private PasswordEncoder passwordEncoder;
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
        User customer = createUser(Role.CUSTOMER);
        JsonNode baseline = json(mockMvc.perform(get("/api/v1/dashboard/today")
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isOk()).andReturn());

        createReservation(customer, employee, ReservationStatus.PENDING);
        createReservation(customer, employee, ReservationStatus.CONFIRMED);
        createOrder(customer, OrderStatus.CREATED, new BigDecimal("100.00"), null);
        createOrder(customer, OrderStatus.IN_PROGRESS, new BigDecimal("200.00"), employee.getId());

        JsonNode result = json(mockMvc.perform(get("/api/v1/dashboard/today")
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isOk()).andReturn());
        assertThat(result.get("pendingReservationsToMe").asLong())
                .isEqualTo(baseline.get("pendingReservationsToMe").asLong() + 1);
        assertThat(result.get("confirmedTodayCount").asLong())
                .isEqualTo(baseline.get("confirmedTodayCount").asLong() + 1);
        assertThat(result.get("unclaimedOrdersCount").asLong())
                .isEqualTo(baseline.get("unclaimedOrdersCount").asLong() + 1);
        assertThat(result.get("myInProgressOrdersCount").asLong())
                .isEqualTo(baseline.get("myInProgressOrdersCount").asLong() + 1);
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
    }

    private Reservation createReservation(
            User customer, User employee, ReservationStatus status) {
        Reservation reservation = new Reservation();
        reservation.setCustomerId(customer.getId());
        reservation.setEmployeeId(employee.getId());
        reservation.setServiceId(UUID.randomUUID());
        reservation.setStartTime(Instant.now().plus(1, ChronoUnit.HOURS));
        reservation.setEndTime(Instant.now().plus(2, ChronoUnit.HOURS));
        reservation.setStatus(status);
        return reservationRepository.saveAndFlush(reservation);
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
