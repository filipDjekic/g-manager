package com.game_manager.gm.workinghours;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.user.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkingHoursIntegrationTest {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Belgrade");

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkingHoursRepository workingHoursRepository;
    @Autowired private WorkingHoursExceptionRepository exceptionRepository;
    @Autowired private WorkingHoursService workingHoursService;
    @Autowired private PasswordEncoder passwordEncoder;

    @Test
    void allRolesCanReadSevenDaysButOnlyManagementCanUpdate() throws Exception {
        String customerToken = login(createUser(Role.CUSTOMER));
        String adminToken = login(createUser(Role.ADMIN));

        mockMvc.perform(get("/api/v1/working-hours")
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7));
        mockMvc.perform(put("/api/v1/working-hours/FRIDAY")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(hoursBody("20:00:00", "02:00:00", true, 0)))
                .andExpect(status().isForbidden());

        long version = workingHoursRepository.findByDayOfWeek(DayOfWeek.FRIDAY)
                .orElseThrow().getVersion();
        mockMvc.perform(put("/api/v1/working-hours/FRIDAY")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(hoursBody("21:00:00", "03:00:00", true, version)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.spansMidnight").value(true))
                .andExpect(jsonPath("$.version").value(version + 1));

        mockMvc.perform(put("/api/v1/working-hours/MONDAY")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(hoursBody("08:00:00", "08:00:00", true, 0)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void exceptionsValidateFutureDateModeUniquenessUpdateAndDelete() throws Exception {
        String ownerToken = login(createUser(Role.OWNER));
        LocalDate date = LocalDate.now(BUSINESS_ZONE).plusDays(45);

        mockMvc.perform(post("/api/v1/working-hours/exceptions")
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(exceptionBody(date, false, null)))
                .andExpect(status().isUnprocessableEntity());

        MvcResult created = mockMvc.perform(post("/api/v1/working-hours/exceptions")
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(exceptionBody(date, true, null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullDayClosed").value(true))
                .andReturn();
        String id = json(created, "id");
        long version = Long.parseLong(json(created, "version"));

        mockMvc.perform(post("/api/v1/working-hours/exceptions")
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(exceptionBody(date, true, null)))
                .andExpect(status().isConflict());

        MvcResult updated = mockMvc.perform(put("/api/v1/working-hours/exceptions/{id}", id)
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(exceptionBody(date, false, version)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overrideOpenTime").value("10:00:00"))
                .andReturn();
        long updatedVersion = Long.parseLong(json(updated, "version"));

        mockMvc.perform(delete("/api/v1/working-hours/exceptions/{id}", id)
                        .queryParam("version", String.valueOf(updatedVersion))
                        .header("Authorization", bearer(ownerToken)))
                .andExpect(status().isNoContent());
        assertThat(exceptionRepository.findById(UUID.fromString(id))).isEmpty();
    }

    @Test
    void validatorHandlesPreviousDayShiftMidnightAndEndBoundary() {
        configure(DayOfWeek.FRIDAY, "20:00", "02:00", true);
        configure(DayOfWeek.SATURDAY, "09:00", "17:00", false);
        LocalDate saturday = LocalDate.of(2026, 7, 18);

        Instant midnight = instant(saturday, "00:00");
        Instant oneAm = instant(saturday, "01:00");
        workingHoursService.validateWithinWorkingHours(midnight, oneAm);

        assertThatThrownBy(() -> workingHoursService.validateWithinWorkingHours(
                instant(saturday, "01:30"), instant(saturday, "02:30")))
                .isInstanceOf(ApplicationException.class)
                .hasMessageContaining("exceeds");
        assertThatThrownBy(() -> workingHoursService.validateWithinWorkingHours(
                instant(saturday, "02:00"), instant(saturday, "02:30")))
                .isInstanceOf(ApplicationException.class)
                .hasMessageContaining("outside");
    }

    @Test
    void validatorBuildsFreshInstantBoundariesAcrossDstGapAndOverlap() {
        configure(DayOfWeek.SUNDAY, "01:00", "04:00", true);

        LocalDate springGap = LocalDate.of(2026, 3, 29);
        Instant springStart = instant(springGap, "01:30");
        Instant springEnd = instant(springGap, "03:30");
        assertThat(springEnd.minusSeconds(3600)).isEqualTo(springStart);
        workingHoursService.validateWithinWorkingHours(springStart, springEnd);

        LocalDate autumnOverlap = LocalDate.of(2026, 10, 25);
        Instant autumnStart = instant(autumnOverlap, "02:30");
        Instant autumnEnd = instant(autumnOverlap, "03:30");
        assertThat(autumnEnd.minusSeconds(7200)).isEqualTo(autumnStart);
        workingHoursService.validateWithinWorkingHours(autumnStart, autumnEnd);
    }

    private void configure(DayOfWeek day, String open, String close, boolean active) {
        WorkingHours hours = workingHoursRepository.findByDayOfWeek(day).orElseThrow();
        hours.setOpenTime(LocalTime.parse(open));
        hours.setCloseTime(LocalTime.parse(close));
        hours.setActive(active);
        workingHoursRepository.saveAndFlush(hours);
    }

    private Instant instant(LocalDate date, String time) {
        return ZonedDateTime.of(date, LocalTime.parse(time), BUSINESS_ZONE).toInstant();
    }

    private User createUser(Role role) {
        User user = new User();
        user.setName(role + " Hours User");
        user.setEmail(role.name().toLowerCase() + "-hours-" + UUID.randomUUID() + "@example.com");
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
                .andExpect(status().isOk())
                .andReturn();
        return json(result, "token");
    }

    private String hoursBody(
            String open, String close, boolean active, long version) {
        return """
                {"openTime":"%s","closeTime":"%s","active":%s,"version":%d}
                """.formatted(open, close, active, version);
    }

    private String exceptionBody(LocalDate date, boolean fullDayClosed, Long version) {
        String versionField = version == null ? "" : ",\"version\":" + version;
        if (fullDayClosed) {
            return """
                    {"date":"%s","description":"Holiday","fullDayClosed":true%s}
                    """.formatted(date, versionField);
        }
        if (version == null) {
            return """
                    {"date":"%s","description":"Short day","fullDayClosed":false}
                    """.formatted(date);
        }
        return """
                {"date":"%s","description":"Short day","fullDayClosed":false,
                 "overrideOpenTime":"10:00:00","overrideCloseTime":"14:00:00"%s}
                """.formatted(date, versionField);
    }

    private String json(MvcResult result, String field) throws Exception {
        return new tools.jackson.databind.ObjectMapper()
                .readTree(result.getResponse().getContentAsByteArray()).get(field).asText();
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
