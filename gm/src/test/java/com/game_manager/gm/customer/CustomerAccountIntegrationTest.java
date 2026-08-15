package com.game_manager.gm.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CustomerAccountIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired UserRepository users;
    @Autowired CustomerActivationTokenRepository activationTokens;
    @Autowired PasswordEncoder passwordEncoder;
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void employeeOwnsTheCustomerActivationLifecycle() throws Exception {
        String employeeToken = login(user(Role.EMPLOYEE));
        MvcResult created = mockMvc.perform(post("/api/v1/customers")
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Gaming Customer\",\"email\":\"gaming-%s@example.test\"}"
                                .formatted(UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.activationSecret").isString())
                .andExpect(jsonPath("$.role").doesNotExist()).andReturn();
        JsonNode body = json.readTree(created.getResponse().getContentAsByteArray());
        UUID id = UUID.fromString(body.get("id").asText());
        String secret = body.get("activationSecret").asText();
        User customer = users.findById(id).orElseThrow();
        assertThat(customer.getRole()).isEqualTo(Role.CUSTOMER);
        assertThat(customer.isMustChangePassword()).isTrue();
        assertThat(activationTokens.findAll()).singleElement()
                .satisfies(token -> assertThat(token.getTokenHash()).doesNotContain(secret));

        mockMvc.perform(post("/api/v1/auth/activate").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"activationSecret\":\"%s\",\"password\":\"CustomerPass1!\"}"
                                .formatted(secret))).andExpect(status().isNoContent());
        mockMvc.perform(post("/api/v1/auth/activate").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"activationSecret\":\"%s\",\"password\":\"CustomerPass1!\"}"
                                .formatted(secret))).andExpect(status().isBadRequest());

        customer = users.findById(id).orElseThrow();
        mockMvc.perform(patch("/api/v1/customers/{id}", id)
                        .header("Authorization", bearer(employeeToken)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Updated Customer\",\"email\":\"%s\",\"version\":%d}"
                                .formatted(customer.getEmail(), customer.getVersion())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("CUSTOMER"));
        mockMvc.perform(post("/api/v1/customers/{id}/deactivate", id)
                        .header("Authorization", bearer(employeeToken))).andExpect(status().isNoContent());
        assertThat(users.findById(id).orElseThrow().isActive()).isFalse();
    }

    @Test
    void customerAnonymousAndPublicRegistrationCannotCreateAccounts() throws Exception {
        String customerToken = login(user(Role.CUSTOMER));
        String request = "{\"name\":\"Forbidden\",\"email\":\"forbidden-%s@example.test\"}"
                .formatted(UUID.randomUUID());
        mockMvc.perform(post("/api/v1/customers").contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/customers").header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON).content(request)).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isForbidden());
    }

    private User user(Role role) {
        User user = new User();
        user.setName(role + " Account Test");
        user.setEmail(role.name().toLowerCase() + "-account-" + UUID.randomUUID() + "@example.test");
        user.setPasswordHash(passwordEncoder.encode("StrongPass1!"));
        user.setRole(role); user.setActive(true);
        return users.saveAndFlush(user);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}"
                                .formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsByteArray()).get("token").asText();
    }

    private static String bearer(String token) { return "Bearer " + token; }
}
