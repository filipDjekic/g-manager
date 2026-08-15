package com.game_manager.gm.resource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.reservation.ReservationRepository;
import com.game_manager.gm.reservation.ReservationStatus;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.workinghours.WorkingHours;
import com.game_manager.gm.workinghours.WorkingHoursRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ResourceIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("Europe/Belgrade");

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private CatalogRepository catalog;
    @Autowired private LocationRepository locations;
    @Autowired private AreaRepository areas;
    @Autowired private PhysicalResourceRepository resources;
    @Autowired private ReservationRepository reservations;
    @Autowired private WorkingHoursRepository workingHours;
    @Autowired private PasswordEncoder passwordEncoder;

    @Test
    void resourceEndpointsEnforcePermissionsAndExposeIntervalAvailability() throws Exception {
        User owner = user(Role.OWNER);
        User customer = user(Role.CUSTOMER);
        CatalogItem service = service();
        Setup setup = resource(service);
        Instant start = futureStart();

        mockMvc.perform(get("/api/v1/resources/locations")
                        .header("Authorization", bearer(login(customer))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem(setup.location().getId().toString())));

        String createLocation = """
                {"code":"SECOND-%s","name":"Second location","address":"Test 2",
                 "timezone":"Europe/Belgrade","active":true}
                """.formatted(uniqueSuffix());
        mockMvc.perform(post("/api/v1/resources/locations")
                        .header("Authorization", bearer(login(customer)))
                        .contentType(MediaType.APPLICATION_JSON).content(createLocation))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/resources/locations")
                        .header("Authorization", bearer(login(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(createLocation))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/resources/areas/{id}/availability", setup.area().getId())
                        .param("start", start.toString())
                        .param("end", start.plusSeconds(1800).toString())
                        .header("Authorization", bearer(login(customer))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(setup.resource().getId().toString()))
                .andExpect(jsonPath("$[0].status").value("AVAILABLE"));
    }

    @Test
    void concurrentBookingsOfOneResourceAllowExactlyOneWinner() throws Exception {
        User firstCustomer = user(Role.CUSTOMER);
        User secondCustomer = user(Role.CUSTOMER);
        User firstEmployee = user(Role.EMPLOYEE);
        User secondEmployee = user(Role.EMPLOYEE);
        CatalogItem service = service();
        Setup setup = resource(service);
        Instant start = futureStart();
        configureOpen(start);
        String firstToken = login(firstCustomer);
        String secondToken = login(secondCustomer);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch startGate = new CountDownLatch(1);

        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = executor.submit(() -> reserve(
                    firstToken, firstEmployee.getId(), service.getId(), setup.resource().getId(),
                    start, ready, startGate));
            Future<Integer> second = executor.submit(() -> reserve(
                    secondToken, secondEmployee.getId(), service.getId(), setup.resource().getId(),
                    start, ready, startGate));
            ready.await();
            startGate.countDown();

            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(201, 409);
        }
        assertThat(reservations.findResourceConflicting(
                setup.resource().getId(), start, start.plusSeconds(1800),
                List.of(ReservationStatus.CANCELLED, ReservationStatus.REJECTED), null))
                .hasSize(1);
    }

    private int reserve(String token, UUID employeeId, UUID serviceId, UUID resourceId,
                        Instant start, CountDownLatch ready, CountDownLatch startGate)
            throws Exception {
        ready.countDown();
        startGate.await();
        String body = """
                {"employeeId":"%s","serviceId":"%s","resourceId":"%s",
                 "startTime":"%s","note":"Concurrency test"}
                """.formatted(employeeId, serviceId, resourceId, start);
        return mockMvc.perform(post("/api/v1/reservations")
                        .header("Authorization", bearer(token))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getStatus();
    }

    private Setup resource(CatalogItem service) {
        Location location = new Location();
        location.setCode("LOCATION-" + uniqueSuffix());
        location.setName("Test location");
        location.setAddress("Test address");
        location.setTimezone(ZONE.getId());
        location.setActive(true);
        location = locations.saveAndFlush(location);

        Area area = new Area();
        area.setLocationId(location.getId());
        area.setCode("AREA-" + uniqueSuffix());
        area.setName("Test area");
        area.setActive(true);
        area = areas.saveAndFlush(area);

        PhysicalResource resource = new PhysicalResource();
        resource.setAreaId(area.getId());
        resource.setServiceId(service.getId());
        resource.setCode("PC-" + uniqueSuffix());
        resource.setName("Gaming PC test");
        resource.setType(ResourceType.GAMING_PC);
        resource.setActive(true);
        resource.setBookable(true);
        resource = resources.saveAndFlush(resource);
        return new Setup(location, area, resource);
    }

    private CatalogItem service() {
        CatalogItem item = new CatalogItem();
        item.setName("PC session " + UUID.randomUUID());
        item.setType(ItemType.SERVICE);
        item.setPrice(new BigDecimal("500.00"));
        item.setDurationMinutes(30);
        item.setActive(true);
        return catalog.saveAndFlush(item);
    }

    private User user(Role role) {
        User user = new User();
        user.setName(role + " Resource User");
        user.setEmail(role.name().toLowerCase() + "-resource-" + UUID.randomUUID() + "@example.test");
        user.setPasswordHash(passwordEncoder.encode("StrongPass1!"));
        user.setRole(role);
        user.setActive(true);
        return users.saveAndFlush(user);
    }

    private Instant futureStart() {
        return ZonedDateTime.of(LocalDate.now(ZONE).plusDays(5), LocalTime.of(12, 0), ZONE)
                .toInstant();
    }

    private void configureOpen(Instant start) {
        WorkingHours hours = workingHours.findByDayOfWeek(start.atZone(ZONE).getDayOfWeek())
                .orElseThrow();
        hours.setOpenTime(LocalTime.of(8, 0));
        hours.setCloseTime(LocalTime.of(20, 0));
        hours.setActive(true);
        workingHours.saveAndFlush(hours);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}"
                                .formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return new tools.jackson.databind.ObjectMapper()
                .readTree(result.getResponse().getContentAsByteArray()).get("token").asText();
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private static String uniqueSuffix() {
        return UUID.randomUUID().toString().substring(0, 12);
    }

    private record Setup(Location location, Area area, PhysicalResource resource) {
    }
}
