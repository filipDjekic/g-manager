package com.game_manager.gm.user;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserManagementIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @Test
    void profileIsOwnedByTokenAndNeverExposesPasswordHash() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        String token = login(customer);

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(customer.getId().toString()))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mockMvc.perform(patch("/api/v1/users/me")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Changed Name\",\"role\":\"OWNER\",\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Changed Name"))
                .andExpect(jsonPath("$.role").value("CUSTOMER"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void passwordChangeRequiresCurrentPasswordAndRevokesOldCredentials() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        String token = login(customer);

        mockMvc.perform(patch("/api/v1/users/me/password")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"wrong-pass\",\"newPassword\":\"NewStrong1!\"}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(patch("/api/v1/users/me/password")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"StrongPass1!\",\"newPassword\":\"NewStrong1!\"}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(customer.getEmail(), "StrongPass1!")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(customer.getEmail(), "NewStrong1!")))
                .andExpect(status().isOk());
    }

    @Test
    void ownerAndAdminRoleMatrixAndVisibilityAreEnforced() throws Exception {
        User owner = createUser(Role.OWNER);
        User admin = createUser(Role.ADMIN);
        User employee = createUser(Role.EMPLOYEE);
        String ownerToken = login(owner);
        String adminToken = login(admin);

        mockMvc.perform(post("/api/v1/users")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("Forbidden Admin", Role.ADMIN)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/users")
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("Allowed Admin", Role.ADMIN)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mockMvc.perform(get("/api/v1/users?size=100")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.role != 'EMPLOYEE')]").isEmpty());
        mockMvc.perform(get("/api/v1/users?size=101")
                        .header("Authorization", bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(100));

        mockMvc.perform(patch("/api/v1/users/{id}/deactivate", admin.getId())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isConflict());
        mockMvc.perform(patch("/api/v1/users/{id}/deactivate", owner.getId())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/v1/users/{id}/deactivate", employee.getId())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isNoContent());
        assertThat(userRepository.findById(employee.getId()).orElseThrow().isActive()).isFalse();
    }

    @Test
    void avatarAcceptsOnlyMatchingMimeAndSignatureAndUsesGeneratedName() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        String token = login(customer);
        byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1};
        MockMultipartFile valid =
                new MockMultipartFile("avatar", "../../original.png", "image/png", png);

        MvcResult response = mockMvc.perform(multipart("/api/v1/users/me/avatar")
                        .file(valid).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(
                        org.hamcrest.Matchers.matchesPattern("/media/avatars/[0-9a-f-]+\\.png")))
                .andReturn();
        assertThat(response.getResponse().getContentAsString()).doesNotContain("original.png");

        MockMultipartFile forged =
                new MockMultipartFile("avatar", "attack.jpg", "image/jpeg", "not-an-image".getBytes());
        mockMvc.perform(multipart("/api/v1/users/me/avatar")
                        .file(forged).header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void operationalCreateRateLimitReturnsStandardized429() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        String token = login(customer);

        for (int attempt = 0; attempt < 30; attempt++) {
            mockMvc.perform(post("/api/v1/orders")
                            .header("Authorization", bearer(token))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isBadRequest());
        }

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.error").value("Too Many Requests"))
                .andExpect(jsonPath("$.path").value("/api/v1/orders"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());
    }

    private User createUser(Role role) {
        User user = new User();
        user.setName(role + " User");
        user.setEmail(role.name().toLowerCase() + "-" + UUID.randomUUID() + "@example.com");
        user.setPasswordHash(passwordEncoder.encode("StrongPass1!"));
        user.setRole(role);
        user.setActive(true);
        return userRepository.saveAndFlush(user);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(user.getEmail(), "StrongPass1!")))
                .andExpect(status().isOk())
                .andReturn();
        return new tools.jackson.databind.ObjectMapper()
                .readTree(result.getResponse().getContentAsByteArray()).get("token").asText();
    }

    private String createBody(String name, Role role) {
        return """
                {"name":"%s","email":"%s@example.com","password":"StrongPass1!","role":"%s"}
                """.formatted(name, UUID.randomUUID(), role);
    }

    private String loginBody(String email, String password) {
        return "{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
