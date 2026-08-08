package com.game_manager.gm.stage7;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuditSoftDeleteIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired UserRepository users;
    @Autowired CatalogRepository catalog;
    @Autowired PasswordEncoder encoder;

    @Test
    void deletedUserIsIsolatedRestoredAndAuditedWithoutSecrets() throws Exception {
        User owner = user(Role.OWNER);
        User employee = user(Role.EMPLOYEE);
        String token = login(owner);

        mockMvc.perform(delete("/api/v1/users/{id}", employee.getId())
                        .header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Duplicate employee account\"}"))
                .andExpect(status().isNoContent());

        assertThat(users.findById(employee.getId())).isEmpty();
        assertThat(users.findDeletedById(employee.getId())).isPresent();
        mockMvc.perform(get("/api/v1/users?size=100").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(employee.getId())).isEmpty());
        mockMvc.perform(get("/api/v1/users/deleted").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(employee.getId())).exists());

        MvcResult audit = mockMvc.perform(get("/api/v1/audit-events?action=USER_DELETED")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andReturn();
        assertThat(audit.getResponse().getContentAsString())
                .doesNotContain("StrongPass1!", "passwordHash", employee.getPasswordHash());

        mockMvc.perform(post("/api/v1/users/{id}/restore", employee.getId())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deletedAt").isEmpty());
        assertThat(users.findById(employee.getId())).isPresent();
    }

    @Test
    void deletedCatalogItemIsExcludedAndCanBeRestored() throws Exception {
        String token = login(user(Role.OWNER));
        CatalogItem item = new CatalogItem();
        item.setName("Recoverable product"); item.setType(ItemType.PRODUCT);
        item.setPrice(BigDecimal.TEN); item.setActive(true);
        item = catalog.saveAndFlush(item);

        mockMvc.perform(delete("/api/v1/catalog/{id}", item.getId())
                        .header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Created by mistake\"}"))
                .andExpect(status().isNoContent());
        assertThat(catalog.findById(item.getId())).isEmpty();
        mockMvc.perform(get("/api/v1/catalog/{id}", item.getId()).header("Authorization", bearer(token)))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/v1/catalog/{id}/restore", item.getId()).header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deletedAt").isEmpty());
    }

    @Test
    void auditPermissionsHideOwnerOnlyEventsFromAdminAndDenyEmployees() throws Exception {
        User owner = user(Role.OWNER);
        String ownerToken = login(owner);
        mockMvc.perform(patch("/api/v1/users/me").header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Updated Owner\"}"))
                .andExpect(status().isOk());

        String adminToken = login(user(Role.ADMIN));
        mockMvc.perform(get("/api/v1/audit-events?action=USER_PROFILE_UPDATED")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        String employeeToken = login(user(Role.EMPLOYEE));
        mockMvc.perform(get("/api/v1/audit-events").header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());
    }

    private User user(Role role) {
        User value = new User(); value.setName(role + " Audit User");
        value.setEmail(role.name().toLowerCase() + UUID.randomUUID() + "@example.test");
        value.setPasswordHash(encoder.encode("StrongPass1!")); value.setRole(role); value.setActive(true);
        return users.saveAndFlush(value);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return new tools.jackson.databind.ObjectMapper().readTree(
                result.getResponse().getContentAsByteArray()).get("token").asText();
    }

    private String bearer(String token) { return "Bearer " + token; }
}
