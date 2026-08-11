package com.game_manager.gm.availability;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.reservation.Reservation;
import com.game_manager.gm.reservation.ReservationRepository;
import com.game_manager.gm.reservation.ReservationStatus;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.workinghours.WorkingHours;
import com.game_manager.gm.workinghours.WorkingHoursException;
import com.game_manager.gm.workinghours.WorkingHoursExceptionRepository;
import com.game_manager.gm.workinghours.WorkingHoursRepository;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.zone.ZoneOffsetTransition;
import java.util.HashSet;
import java.util.Set;
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
class AvailabilityIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("Europe/Belgrade");
    @Autowired MockMvc mockMvc;
    @Autowired UserRepository users;
    @Autowired CatalogRepository catalog;
    @Autowired ReservationRepository reservations;
    @Autowired WorkingHoursRepository hours;
    @Autowired WorkingHoursExceptionRepository exceptions;
    @Autowired WorkingHoursService workingHoursService;
    @Autowired PasswordEncoder passwordEncoder;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void slotsRespectWorkingHoursHolidayAndStrictOverlapBoundaries() throws Exception {
        User customer = user(Role.CUSTOMER, true);
        User employee = user(Role.EMPLOYEE, true);
        CatalogItem service = service(true, 30);
        LocalDate date = LocalDate.now(ZONE).plusDays(40);
        configure(date, LocalTime.of(8, 0), LocalTime.of(13, 0));
        Instant busyStart = at(date, 10, 0);
        reservation(customer, employee, service, busyStart, busyStart.plus(Duration.ofHours(1)));

        JsonNode response = availability(login(customer), service.getId(), employee.getId(), date, date);
        Set<Instant> starts = starts(response);
        assertThat(starts).contains(at(date, 9, 30), at(date, 11, 0));
        assertThat(starts).doesNotContain(at(date, 9, 45), at(date, 10, 0),
                at(date, 10, 15), at(date, 10, 30), at(date, 10, 45));
        for (JsonNode slot : response.get("employees").get(0).get("slots")) {
            workingHoursService.validateWithinWorkingHours(
                    Instant.parse(slot.get("startTime").asText()), Instant.parse(slot.get("endTime").asText()));
        }

        LocalDate holiday = date.plusDays(1);
        closed(holiday);
        JsonNode closedResponse = availability(login(customer), service.getId(), employee.getId(), holiday, holiday);
        assertThat(closedResponse.get("employees").get(0).get("slots").isEmpty()).isTrue();
    }

    @Test
    void slotsRemainValidAcrossDstAndOvernightWindows() throws Exception {
        User customer = user(Role.CUSTOMER, true);
        User employee = user(Role.EMPLOYEE, true);
        CatalogItem service = service(true, 60);
        ZoneOffsetTransition transition = ZONE.getRules().nextTransition(Instant.now());
        LocalDate dstDate = transition.getDateTimeAfter().toLocalDate();
        override(dstDate, LocalTime.MIDNIGHT, LocalTime.of(5, 0));

        JsonNode dst = availability(login(customer), service.getId(), employee.getId(), dstDate, dstDate);
        Set<Instant> unique = new HashSet<>();
        for (JsonNode slot : dst.get("employees").get(0).get("slots")) {
            Instant start = Instant.parse(slot.get("startTime").asText());
            Instant end = Instant.parse(slot.get("endTime").asText());
            assertThat(Duration.between(start, end)).isEqualTo(Duration.ofHours(1));
            workingHoursService.validateWithinWorkingHours(start, end);
            assertThat(unique.add(start)).isTrue();
        }
        assertThat(unique).isNotEmpty();

        LocalDate overnight = dstDate.plusDays(8);
        override(overnight, LocalTime.of(22, 0), LocalTime.of(2, 0));
        JsonNode overnightResponse = availability(login(customer), service.getId(), employee.getId(), overnight, overnight);
        JsonNode last = overnightResponse.get("employees").get(0).get("slots");
        assertThat(last.isEmpty()).isFalse();
        Instant lastEnd = Instant.parse(last.get(last.size() - 1).get("endTime").asText());
        assertThat(lastEnd.atZone(ZONE).toLocalDate()).isEqualTo(overnight.plusDays(1));
    }

    @Test
    void rejectsInactiveInputsAndCreateRevalidatesAStaleSlot() throws Exception {
        User firstCustomer = user(Role.CUSTOMER, true);
        User secondCustomer = user(Role.CUSTOMER, true);
        User employee = user(Role.EMPLOYEE, true);
        User inactiveEmployee = user(Role.EMPLOYEE, false);
        CatalogItem activeService = service(true, 30);
        CatalogItem inactiveService = service(false, 30);
        LocalDate date = LocalDate.now(ZONE).plusDays(55);
        configure(date, LocalTime.of(9, 0), LocalTime.of(12, 0));
        String token = login(firstCustomer);

        mockMvc.perform(get("/api/v1/availability")
                        .header("Authorization", bearer(token))
                        .param("serviceId", inactiveService.getId().toString())
                        .param("employeeId", employee.getId().toString())
                        .param("from", date.toString()).param("to", date.toString()))
                .andExpect(status().isUnprocessableEntity());
        mockMvc.perform(get("/api/v1/availability")
                        .header("Authorization", bearer(token))
                        .param("serviceId", activeService.getId().toString())
                        .param("employeeId", inactiveEmployee.getId().toString())
                        .param("from", date.toString()).param("to", date.toString()))
                .andExpect(status().isUnprocessableEntity());

        JsonNode available = availability(token, activeService.getId(), employee.getId(), date, date);
        String start = available.get("employees").get(0).get("slots").get(0).get("startTime").asText();
        create(login(firstCustomer), employee.getId(), activeService.getId(), start)
                .andExpect(status().isCreated());
        create(login(secondCustomer), employee.getId(), activeService.getId(), start)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Employee is unavailable at this time"));

        String anyStart = available.get("employees").get(0).get("slots").get(2).get("startTime").asText();
        String nextAnyStart = available.get("employees").get(0).get("slots").get(4).get("startTime").asText();
        String firstAssigned = mapper.readTree(createAny(login(firstCustomer), activeService.getId(), anyStart)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray())
                .get("employeeId").asText();
        String secondAssigned = mapper.readTree(createAny(login(secondCustomer), activeService.getId(), nextAnyStart)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray())
                .get("employeeId").asText();
        assertThat(secondAssigned).isEqualTo(firstAssigned);
    }

    private JsonNode availability(String token, UUID serviceId, UUID employeeId,
            LocalDate from, LocalDate to) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/availability")
                        .header("Authorization", bearer(token))
                        .param("serviceId", serviceId.toString()).param("employeeId", employeeId.toString())
                        .param("from", from.toString()).param("to", to.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.timezone").value("Europe/Belgrade"))
                .andReturn();
        return mapper.readTree(result.getResponse().getContentAsByteArray());
    }

    private org.springframework.test.web.servlet.ResultActions create(
            String token, UUID employeeId, UUID serviceId, String start) throws Exception {
        return mockMvc.perform(post("/api/v1/reservations")
                .header("Authorization", bearer(token)).header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"employeeId\":\"%s\",\"serviceId\":\"%s\",\"startTime\":\"%s\"}"
                        .formatted(employeeId, serviceId, start)));
    }

    private org.springframework.test.web.servlet.ResultActions createAny(
            String token, UUID serviceId, String start) throws Exception {
        return mockMvc.perform(post("/api/v1/reservations")
                .header("Authorization", bearer(token)).header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceId\":\"%s\",\"startTime\":\"%s\"}".formatted(serviceId, start)));
    }

    private Set<Instant> starts(JsonNode response) {
        Set<Instant> values = new HashSet<>();
        response.get("employees").get(0).get("slots").forEach(
                slot -> values.add(Instant.parse(slot.get("startTime").asText())));
        return values;
    }

    private void configure(LocalDate date, LocalTime open, LocalTime close) {
        WorkingHours value = hours.findByDayOfWeek(date.getDayOfWeek()).orElseThrow();
        value.setActive(true); value.setOpenTime(open); value.setCloseTime(close); hours.saveAndFlush(value);
        exceptions.findByDate(date).ifPresent(exceptions::delete);
    }

    private void closed(LocalDate date) {
        exceptions.findByDate(date).ifPresent(exceptions::delete);
        WorkingHoursException value = new WorkingHoursException();
        value.setDate(date); value.setFullDayClosed(true); exceptions.saveAndFlush(value);
    }

    private void override(LocalDate date, LocalTime open, LocalTime close) {
        exceptions.findByDate(date).ifPresent(exceptions::delete);
        WorkingHoursException value = new WorkingHoursException();
        value.setDate(date); value.setFullDayClosed(false);
        value.setOverrideOpenTime(open); value.setOverrideCloseTime(close); exceptions.saveAndFlush(value);
    }

    private Reservation reservation(User customer, User employee, CatalogItem service, Instant start, Instant end) {
        Reservation value = new Reservation();
        value.setCustomerId(customer.getId()); value.setEmployeeId(employee.getId()); value.setServiceId(service.getId());
        value.setStartTime(start); value.setEndTime(end); value.setStatus(ReservationStatus.CONFIRMED);
        return reservations.saveAndFlush(value);
    }

    private User user(Role role, boolean active) {
        User value = new User(); value.setName(role + " Availability " + UUID.randomUUID());
        value.setEmail(role.name().toLowerCase() + "-availability-" + UUID.randomUUID() + "@example.com");
        value.setPasswordHash(passwordEncoder.encode("StrongPass1!")); value.setRole(role); value.setActive(active);
        return users.saveAndFlush(value);
    }

    private CatalogItem service(boolean active, int duration) {
        CatalogItem value = new CatalogItem(); value.setName("Availability service " + UUID.randomUUID());
        value.setType(ItemType.SERVICE); value.setPrice(new BigDecimal("1000.00"));
        value.setDurationMinutes(duration); value.setActive(active); return catalog.saveAndFlush(value);
    }

    private Instant at(LocalDate date, int hour, int minute) {
        return ZonedDateTime.of(date, LocalTime.of(hour, minute), ZONE).toInstant();
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return mapper.readTree(result.getResponse().getContentAsByteArray()).get("token").asText();
    }

    private String bearer(String token) { return "Bearer " + token; }
}
