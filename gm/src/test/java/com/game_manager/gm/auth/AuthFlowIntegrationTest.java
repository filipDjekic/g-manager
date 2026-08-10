package com.game_manager.gm.auth;

import com.game_manager.gm.common.config.GManagerProperties;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthFlowIntegrationTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void registerLoginRotateLogoutAndDetectRefreshReuse() throws Exception {
        String email = "auth-" + UUID.randomUUID() + "@example.com";
        register(email);

        MvcResult login = login(email, "StrongPass1!");
        String accessToken = jsonString(login, "token");
        Cookie originalRefresh = login.getResponse().getCookie(AuthController.REFRESH_COOKIE);

        assertThat(originalRefresh).isNotNull();
        assertThat(originalRefresh.isHttpOnly()).isTrue();
        assertThat(originalRefresh.getPath()).isEqualTo("/api/v1/auth");
        assertThat(decodedJwtPayload(accessToken)).contains("\"sub\"").doesNotContain("role");

        MvcResult refreshed = mockMvc.perform(post("/api/v1/auth/refresh").cookie(originalRefresh))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly(AuthController.REFRESH_COOKIE, true))
                .andReturn();
        Cookie replacementRefresh = refreshed.getResponse().getCookie(AuthController.REFRESH_COOKIE);
        assertThat(replacementRefresh).isNotNull();
        assertThat(replacementRefresh.getValue()).isNotEqualTo(originalRefresh.getValue());

        mockMvc.perform(post("/api/v1/auth/refresh").cookie(originalRefresh))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Refresh token reuse detected"));

        mockMvc.perform(post("/api/v1/auth/refresh").cookie(replacementRefresh))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/auth/logout").cookie(replacementRefresh))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthController.REFRESH_COOKIE, 0));
    }

    @Test
    void registrationIsCustomerOnlyAndDuplicateEmailIsConflict() throws Exception {
        String email = "customer-" + UUID.randomUUID() + "@example.com";
        register(email);
        User user = userRepository.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(user.getRole().name()).isEqualTo("CUSTOMER");
        assertThat(user.isActive()).isTrue();
        assertThat(user.getPasswordHash()).doesNotContain("StrongPass1!");

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email.toUpperCase())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void loginDoesNotRevealWhetherAccountExistsOrIsInactive() throws Exception {
        String email = "inactive-" + UUID.randomUUID() + "@example.com";
        register(email);
        User user = userRepository.findByEmailIgnoreCase(email).orElseThrow();
        user.setActive(false);
        userRepository.saveAndFlush(user);

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(email, "StrongPass1!")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("missing-" + UUID.randomUUID() + "@example.com", "StrongPass1!")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    void bearerAuthenticationReloadsActiveUserFromDatabase() throws Exception {
        String email = "bearer-" + UUID.randomUUID() + "@example.com";
        register(email);
        String token = jsonString(login(email, "StrongPass1!"), "token");

        mockMvc.perform(get("/api/v1/not-defined").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        User user = userRepository.findByEmailIgnoreCase(email).orElseThrow();
        user.setActive(false);
        userRepository.saveAndFlush(user);

        mockMvc.perform(get("/api/v1/not-defined").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void provisionsInitialOwnerWithoutStoringPlaintextPassword() throws Exception {
        String email = "owner-" + UUID.randomUUID() + "@example.com";
        String password = "OwnerPass1!";
        InitialOwnerProvisioner provisioner = new InitialOwnerProvisioner(
                userRepository,
                passwordEncoder,
                new GManagerProperties(
                        java.time.ZoneId.of("Europe/Belgrade"),
                        java.util.List.of("http://localhost:5173"),
                        new GManagerProperties.Storage(
                                java.nio.file.Path.of("target/test-uploads")),
                new GManagerProperties.Idempotency(24, "0 0 3 * * *", 120),
                        new GManagerProperties.Outbox(false, 10, 1000, 30, 3, 2, 30),
                        new GManagerProperties.Jobs(false, 2, 4, 2, 1000, 30, 60,
                                3, 2, 10, 30, 365),
                        new GManagerProperties.Reservations(60),
                        new GManagerProperties.Notifications(false, 25, 5, 10, 90, 1800),
                        new GManagerProperties.Jwt(
                                "test-only-secret-with-at-least-32-bytes",
                                15, 14, false),
                        new GManagerProperties.InitialOwner(
                                "System Owner", email, password))
        );

        provisioner.run(null);

        User owner = userRepository.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(owner.getRole().name()).isEqualTo("OWNER");
        assertThat(owner.isActive()).isTrue();
        assertThat(passwordEncoder.matches(password, owner.getPasswordHash())).isTrue();
        assertThat(owner.getPasswordHash()).isNotEqualTo(password);
    }

    private void register(String email) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("CUSTOMER"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    private MvcResult login(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(email, password)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.expiresAt").isString())
                .andExpect(jsonPath("$.user.email").value(email))
                .andReturn();
    }

    private String jsonString(MvcResult result, String field) throws Exception {
        tools.jackson.databind.JsonNode node = new tools.jackson.databind.ObjectMapper()
                .readTree(result.getResponse().getContentAsByteArray());
        return node.get(field).asText();
    }

    private String decodedJwtPayload(String token) {
        return new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
    }

    private String registerBody(String email) {
        return """
                {"name":"Auth Customer","email":"%s","password":"StrongPass1!"}
                """.formatted(email);
    }

    private String loginBody(String email, String password) {
        return """
                {"email":"%s","password":"%s"}
                """.formatted(email, password);
    }
}
