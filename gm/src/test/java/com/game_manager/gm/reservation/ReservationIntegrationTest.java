package com.game_manager.gm.reservation;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.user.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.workinghours.WorkingHours;
import com.game_manager.gm.workinghours.WorkingHoursRepository;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReservationIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("Europe/Belgrade");

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private CatalogRepository catalogRepository;
    @Autowired private ReservationRepository reservationRepository;
    @Autowired private WorkingHoursRepository workingHoursRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @Test
    void createIsIdempotentValidatesHeaderAndPreventsOverlap() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        User secondCustomer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        CatalogItem service = createCatalog(ItemType.SERVICE, true);
        Instant start = futureOpenTime(3, 12, 0);
        configureOpen(start);
        String customerToken = login(customer);
        String secondToken = login(secondCustomer);
        long reservationCountBeforeCreate = reservationRepository.count();
        String body = createBody(employee.getId(), service.getId(), start, "First");

        mockMvc.perform(post("/api/v1/reservations")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Idempotency-Key header is required"));

        String key = UUID.randomUUID().toString();
        MvcResult first = mockMvc.perform(post("/api/v1/reservations")
                        .header("Authorization", bearer(customerToken))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn();
        String reservationId = json(first, "id");

        mockMvc.perform(post("/api/v1/reservations")
                        .header("Authorization", bearer(customerToken))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(reservationId));
        assertThat(reservationRepository.count()).isEqualTo(reservationCountBeforeCreate + 1);

        mockMvc.perform(post("/api/v1/reservations")
                        .header("Authorization", bearer(customerToken))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(employee.getId(), service.getId(), start.plusSeconds(3600), "Changed")))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/v1/reservations")
                        .header("Authorization", bearer(secondToken))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(employee.getId(), service.getId(), start.plusSeconds(600), null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Employee is unavailable at this time"));
    }

    @Test
    void createRejectsProductsInactiveServicesAndInvalidEmployees() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        User admin = createUser(Role.ADMIN);
        CatalogItem product = createCatalog(ItemType.PRODUCT, true);
        CatalogItem inactiveService = createCatalog(ItemType.SERVICE, false);
        Instant start = futureOpenTime(5, 13, 0);
        configureOpen(start);
        String token = login(customer);

        createRequest(token, createBody(employee.getId(), product.getId(), start, null))
                .andExpect(status().isUnprocessableEntity());
        createRequest(token, createBody(employee.getId(), inactiveService.getId(), start, null))
                .andExpect(status().isUnprocessableEntity());
        createRequest(token, createBody(admin.getId(), createCatalog(ItemType.SERVICE, true).getId(), start, null))
                .andExpect(status().isUnprocessableEntity());
        createRequest(token, createBody(employee.getId(), createCatalog(ItemType.SERVICE, true).getId(),
                        Instant.now().minusSeconds(60), null))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listsAreOwnershipScopedAndEmployeeCannotChangeAnotherEmployeesReservation()
            throws Exception {
        User customer = createUser(Role.CUSTOMER);
        User otherCustomer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        User otherEmployee = createUser(Role.EMPLOYEE);
        CatalogItem service = createCatalog(ItemType.SERVICE, true);
        Reservation reservation = createReservation(
                customer, employee, service, Instant.now().plus(2, ChronoUnit.DAYS),
                ReservationStatus.PENDING);
        createReservation(
                otherCustomer, otherEmployee, service, Instant.now().plus(3, ChronoUnit.DAYS),
                ReservationStatus.PENDING);

        mockMvc.perform(get("/api/v1/reservations/me?size=100")
                        .header("Authorization", bearer(login(customer))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].customerId")
                        .value(customer.getId().toString()));
        mockMvc.perform(get("/api/v1/reservations?size=100")
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].employeeId")
                        .value(employee.getId().toString()));

        mockMvc.perform(patch("/api/v1/reservations/{id}/status", reservation.getId())
                        .header("Authorization", bearer(login(otherEmployee)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(statusBody("CONFIRMED", reservation.getVersion())))
                .andExpect(status().isForbidden());
    }

    @Test
    void stateMachineCutoffCompletionAndVersionsAreEnforced() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        User admin = createUser(Role.ADMIN);
        CatalogItem service = createCatalog(ItemType.SERVICE, true);
        Reservation pending = createReservation(
                customer, employee, service, Instant.now().plus(2, ChronoUnit.DAYS),
                ReservationStatus.PENDING);
        String employeeToken = login(employee);

        MvcResult confirmed = mockMvc.perform(
                        patch("/api/v1/reservations/{id}/status", pending.getId())
                                .header("Authorization", bearer(employeeToken))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(statusBody("CONFIRMED", pending.getVersion())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andReturn();
        long confirmedVersion = Long.parseLong(json(confirmed, "version"));

        mockMvc.perform(patch("/api/v1/reservations/{id}/status", pending.getId())
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(statusBody("REJECTED", confirmedVersion)))
                .andExpect(status().isConflict());
        mockMvc.perform(patch("/api/v1/reservations/{id}/status", pending.getId())
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(statusBody("COMPLETED", confirmedVersion)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Reservation has not ended yet"));

        Reservation near = createReservation(
                customer, employee, service, Instant.now().plus(30, ChronoUnit.MINUTES),
                ReservationStatus.CONFIRMED);
        mockMvc.perform(patch("/api/v1/reservations/{id}/status", near.getId())
                        .header("Authorization", bearer(login(customer)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(statusBody("CANCELLED", near.getVersion())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("It is too late to cancel this reservation"));
        mockMvc.perform(patch("/api/v1/reservations/{id}/status", near.getId())
                        .header("Authorization", bearer(login(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(statusBody("CANCELLED", near.getVersion())))
                .andExpect(status().isOk());

        Reservation elapsed = createReservation(
                customer, employee, service, Instant.now().minus(2, ChronoUnit.HOURS),
                ReservationStatus.CONFIRMED);
        elapsed.setEndTime(Instant.now().minus(90, ChronoUnit.MINUTES));
        elapsed = reservationRepository.saveAndFlush(elapsed);
        mockMvc.perform(patch("/api/v1/reservations/{id}/status", elapsed.getId())
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(statusBody("COMPLETED", elapsed.getVersion())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        mockMvc.perform(patch("/api/v1/reservations/{id}/status", pending.getId())
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(statusBody("CANCELLED", 0)))
                .andExpect(status().isConflict());
    }

    private org.springframework.test.web.servlet.ResultActions createRequest(
            String token, String body) throws Exception {
        return mockMvc.perform(post("/api/v1/reservations")
                .header("Authorization", bearer(token))
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private Reservation createReservation(
            User customer, User employee, CatalogItem service,
            Instant start, ReservationStatus status) {
        Reservation reservation = new Reservation();
        reservation.setCustomerId(customer.getId());
        reservation.setEmployeeId(employee.getId());
        reservation.setServiceId(service.getId());
        reservation.setStartTime(start);
        reservation.setEndTime(start.plus(30, ChronoUnit.MINUTES));
        reservation.setStatus(status);
        return reservationRepository.saveAndFlush(reservation);
    }

    private CatalogItem createCatalog(ItemType type, boolean active) {
        CatalogItem item = new CatalogItem();
        item.setName(type + " " + UUID.randomUUID());
        item.setType(type);
        item.setPrice(new BigDecimal("1000.00"));
        item.setDurationMinutes(type == ItemType.SERVICE ? 30 : null);
        item.setActive(active);
        return catalogRepository.saveAndFlush(item);
    }

    private User createUser(Role role) {
        User user = new User();
        user.setName(role + " Reservation User");
        user.setEmail(role.name().toLowerCase() + "-reservation-" + UUID.randomUUID() + "@example.com");
        user.setPasswordHash(passwordEncoder.encode("StrongPass1!"));
        user.setRole(role);
        user.setActive(true);
        return userRepository.saveAndFlush(user);
    }

    private Instant futureOpenTime(int days, int hour, int minute) {
        LocalDate date = LocalDate.now(ZONE).plusDays(days);
        return ZonedDateTime.of(date, LocalTime.of(hour, minute), ZONE).toInstant();
    }

    private void configureOpen(Instant instant) {
        DayOfWeek day = instant.atZone(ZONE).getDayOfWeek();
        WorkingHours hours = workingHoursRepository.findByDayOfWeek(day).orElseThrow();
        hours.setOpenTime(LocalTime.of(8, 0));
        hours.setCloseTime(LocalTime.of(20, 0));
        hours.setActive(true);
        workingHoursRepository.saveAndFlush(hours);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}"
                                .formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return json(result, "token");
    }

    private String createBody(
            UUID employeeId, UUID serviceId, Instant start, String note) {
        return """
                {"employeeId":"%s","serviceId":"%s","startTime":"%s","note":%s}
                """.formatted(
                employeeId, serviceId, start,
                note == null ? "null" : "\"" + note + "\"");
    }

    private String statusBody(String status, long version) {
        return "{\"status\":\"%s\",\"version\":%d}".formatted(status, version);
    }

    private String json(MvcResult result, String field) throws Exception {
        return new tools.jackson.databind.ObjectMapper()
                .readTree(result.getResponse().getContentAsByteArray()).get(field).asText();
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
