package com.game_manager.gm.feature;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FeatureFlagIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @BeforeEach
    @AfterEach
    void cleanOverride() {
        jdbc.update("DELETE FROM feature_flag_overrides");
    }

    @Test
    void managementRequiresPermissionAndUpdateIsAuditedAndEnforced() throws Exception {
        String employee = token(user(Role.EMPLOYEE, "employee-flags@example.test"));
        mvc.perform(get("/api/v1/features").header("Authorization", bearer(employee)))
                .andExpect(status().isForbidden());

        String owner = token(user(Role.OWNER, "owner-flags@example.test"));
        mvc.perform(patch("/api/v1/features/REPORTS")
                        .header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false,\"rolloutPercentage\":100,"
                                + "\"reason\":\"Controlled Stage 25 rollback\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").value("REPORTS"))
                .andExpect(jsonPath("$.enabled").value(false));

        mvc.perform(get("/api/v1/features/bootstrap").header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key == 'REPORTS')].enabled").value(false));
        mvc.perform(get("/api/v1/reports/definitions").header("Authorization", bearer(owner)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Feature is not available"));
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit_events WHERE action='FEATURE_FLAG_UPDATED'", Long.class)).isEqualTo(1);
    }

    private UUID user(Role role, String email) {
        return users.saveAndFlush(new User(role.name(), email, passwords.encode("Password123!"), role, true, null)).getId();
    }

    private String token(UUID id) throws Exception {
        String email = users.findById(id).orElseThrow().getEmail();
        String body = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"Password123!\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("token").asText();
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
