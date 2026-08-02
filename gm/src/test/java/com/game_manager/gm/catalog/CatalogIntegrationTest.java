package com.game_manager.gm.catalog;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.math.BigDecimal;
import java.util.UUID;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CatalogIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private CatalogRepository catalogRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @Test
    void managementCreatesValidItemsAndCrossFieldRulesReturn422() throws Exception {
        String ownerToken = login(createUser(Role.OWNER));
        String employeeToken = login(createUser(Role.EMPLOYEE));

        mockMvc.perform(post("/api/v1/catalog")
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(serviceBody("Haircut", 30)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("SERVICE"))
                .andExpect(jsonPath("$.active").value(true));

        mockMvc.perform(post("/api/v1/catalog")
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Invalid service","type":"SERVICE","price":100}
                                """))
                .andExpect(status().isUnprocessableEntity());
        mockMvc.perform(post("/api/v1/catalog")
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Invalid product","type":"PRODUCT","price":100,"durationMinutes":15}
                                """))
                .andExpect(status().isUnprocessableEntity());
        mockMvc.perform(post("/api/v1/catalog")
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(serviceBody("Forbidden", 30)))
                .andExpect(status().isForbidden());
    }

    @Test
    void readOnlyRolesSeeOnlyActiveItemsWhileManagementCanFilterAll() throws Exception {
        CatalogItem active = createItem("Searchable active", ItemType.PRODUCT, true);
        CatalogItem inactive = createItem("Searchable inactive", ItemType.PRODUCT, false);
        String customerToken = login(createUser(Role.CUSTOMER));
        String adminToken = login(createUser(Role.ADMIN));

        mockMvc.perform(get("/api/v1/catalog?active=false&search=Searchable&size=100")
                        .header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(active.getId())).exists())
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(inactive.getId())).isEmpty());

        mockMvc.perform(get("/api/v1/catalog?active=false&search=Searchable&size=100")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(inactive.getId())).exists())
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(active.getId())).isEmpty());

        mockMvc.perform(get("/api/v1/catalog?sort=passwordHash")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateAndDeactivateRejectStaleVersions() throws Exception {
        CatalogItem item = createItem("Versioned", ItemType.PRODUCT, true);
        String ownerToken = login(createUser(Role.OWNER));

        MvcResult update = mockMvc.perform(patch("/api/v1/catalog/{id}", item.getId())
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Updated","price":250.00,"version":0}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated"))
                .andExpect(jsonPath("$.version").value(1))
                .andReturn();
        assertThat(update.getResponse().getContentAsString()).doesNotContain("password");

        mockMvc.perform(patch("/api/v1/catalog/{id}", item.getId())
                        .header("Authorization", bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Stale overwrite","version":0}
                                """))
                .andExpect(status().isConflict());
        mockMvc.perform(patch("/api/v1/catalog/{id}/deactivate", item.getId())
                        .queryParam("version", "1")
                        .header("Authorization", bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.version").value(2));
        mockMvc.perform(patch("/api/v1/catalog/{id}/activate", item.getId())
                        .queryParam("version", "2")
                        .header("Authorization", bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.version").value(3));
    }

    @Test
    void catalogImageValidatesSignatureAndNeverUsesOriginalFilename() throws Exception {
        CatalogItem item = createItem("Image item", ItemType.PRODUCT, true);
        String adminToken = login(createUser(Role.ADMIN));
        byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1};

        mockMvc.perform(multipart("/api/v1/catalog/{id}/image", item.getId())
                        .file(new MockMultipartFile(
                                "image", "../../product.png", "image/png", png))
                        .param("version", "0")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl").value(
                        org.hamcrest.Matchers.matchesPattern("/media/catalog/[0-9a-f-]+\\.png")));

        CatalogItem updated = catalogRepository.findById(item.getId()).orElseThrow();
        assertThat(updated.getImageUrl()).doesNotContain("product.png");
        mockMvc.perform(multipart("/api/v1/catalog/{id}/image", item.getId())
                        .file(new MockMultipartFile(
                                "image", "fake.jpg", "image/jpeg", "script".getBytes()))
                        .param("version", updated.getVersion().toString())
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isBadRequest());
    }

    private CatalogItem createItem(String name, ItemType type, boolean active) {
        CatalogItem item = new CatalogItem();
        item.setName(name);
        item.setType(type);
        item.setPrice(new BigDecimal("100.00"));
        item.setDurationMinutes(type == ItemType.SERVICE ? 30 : null);
        item.setActive(active);
        return catalogRepository.saveAndFlush(item);
    }

    private User createUser(Role role) {
        User user = new User();
        user.setName(role + " Catalog User");
        user.setEmail(role.name().toLowerCase() + "-catalog-" + UUID.randomUUID() + "@example.com");
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
        return new tools.jackson.databind.ObjectMapper()
                .readTree(result.getResponse().getContentAsByteArray()).get("token").asText();
    }

    private String serviceBody(String name, int duration) {
        return """
                {"name":"%s","description":"Service","type":"SERVICE","price":1500.00,
                 "durationMinutes":%d}
                """.formatted(name, duration);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
