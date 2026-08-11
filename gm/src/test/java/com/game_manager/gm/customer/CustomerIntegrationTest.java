package com.game_manager.gm.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.order.Order;
import com.game_manager.gm.order.OrderRepository;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.reservation.Reservation;
import com.game_manager.gm.reservation.ReservationRepository;
import com.game_manager.gm.reservation.ReservationStatus;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import jakarta.persistence.EntityManagerFactory;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CustomerIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired UserRepository users;
    @Autowired ReservationRepository reservations;
    @Autowired OrderRepository orders;
    @Autowired CatalogRepository catalog;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired EntityManagerFactory entityManagerFactory;

    @Test
    void managementSeesPaginatedBatchKpisWithCompletedRevenueSemantics() throws Exception {
        User owner = user(Role.OWNER, "Owner");
        User employee = user(Role.EMPLOYEE, "Employee");
        String customerMarker = "Stage8-" + UUID.randomUUID();
        User first = user(Role.CUSTOMER, customerMarker + " Alpha");
        user(Role.CUSTOMER, customerMarker + " Beta");
        CatalogItem service = service();
        reservation(first, employee, service, ReservationStatus.COMPLETED);
        reservation(first, employee, service, ReservationStatus.PENDING);
        order(first, OrderStatus.COMPLETED, "1200.00");
        order(first, OrderStatus.CANCELLED, "9000.00");
        String token = login(owner);
        SessionFactory sessionFactory = entityManagerFactory.unwrap(SessionFactory.class);
        sessionFactory.getStatistics().setStatisticsEnabled(true);
        sessionFactory.getStatistics().clear();

        mockMvc.perform(get("/api/v1/customers").param("search", customerMarker)
                        .param("page", "0").param("size", "1")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements").value(2));
        assertThat(sessionFactory.getStatistics().getPrepareStatementCount()).isLessThanOrEqualTo(6);

        mockMvc.perform(get("/api/v1/customers/{id}", first.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customer.completedAppointmentCount").value(1))
                .andExpect(jsonPath("$.customer.completedOrderCount").value(1))
                .andExpect(jsonPath("$.customer.completedOrderRevenue").value(1200.0))
                .andExpect(jsonPath("$.reservations.length()").value(2))
                .andExpect(jsonPath("$.reservations[0].serviceName").value(service.getName()))
                .andExpect(jsonPath("$.orders.length()").value(2));
    }

    @Test
    void customerAndEmployeeCannotReadCustomer360AndEmptyCustomerHasZeroKpis() throws Exception {
        User owner = user(Role.OWNER, "Owner empty");
        User empty = user(Role.CUSTOMER, "Stage8 Empty");
        User employee = user(Role.EMPLOYEE, "Employee denied");
        mockMvc.perform(get("/api/v1/customers").header("Authorization", bearer(login(empty))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/customers/{id}", empty.getId())
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/customers/{id}", empty.getId())
                        .header("Authorization", bearer(login(owner))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customer.reservationCount").value(0))
                .andExpect(jsonPath("$.customer.completedOrderRevenue").value(0))
                .andExpect(jsonPath("$.customer.lastActivityAt").doesNotExist())
                .andExpect(jsonPath("$.reservations").isEmpty())
                .andExpect(jsonPath("$.orders").isEmpty());
    }

    private User user(Role role, String name) {
        User value = new User(); value.setName(name); value.setEmail("stage8-" + UUID.randomUUID() + "@example.test");
        value.setPasswordHash(passwordEncoder.encode("StrongPass1!")); value.setRole(role); value.setActive(true);
        return users.saveAndFlush(value);
    }
    private CatalogItem service() {
        CatalogItem value = new CatalogItem(); value.setName("Stage8 service"); value.setType(ItemType.SERVICE);
        value.setPrice(BigDecimal.TEN); value.setDurationMinutes(30); value.setActive(true); return catalog.saveAndFlush(value);
    }
    private void reservation(User customer, User employee, CatalogItem service, ReservationStatus status) {
        Reservation value = new Reservation(); value.setCustomerId(customer.getId()); value.setEmployeeId(employee.getId());
        value.setServiceId(service.getId()); value.setStartTime(Instant.now().plus(1, ChronoUnit.DAYS));
        value.setEndTime(value.getStartTime().plus(30, ChronoUnit.MINUTES)); value.setStatus(status); reservations.saveAndFlush(value);
    }
    private void order(User customer, OrderStatus status, String total) {
        Order value = new Order(); value.setCustomerId(customer.getId()); value.setStatus(status);
        value.setTotalPrice(new BigDecimal(total)); orders.saveAndFlush(value);
    }
    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return new tools.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsByteArray())
                .get("token").asText();
    }
    private String bearer(String token) { return "Bearer " + token; }
}
