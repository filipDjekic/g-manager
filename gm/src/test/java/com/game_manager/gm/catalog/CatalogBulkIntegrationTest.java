package com.game_manager.gm.catalog;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CatalogBulkIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired CatalogRepository catalog;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;

    @Test
    void bulkReportsPerItemFailureAndRequiresManagementPermission() throws Exception {
        CatalogItem first = item("Bulk first");
        CatalogItem second = item("Bulk second");
        String owner = login(user(Role.OWNER));
        String customer = login(user(Role.CUSTOMER));
        String body = """
                {"action":"DEACTIVATE","items":[
                  {"id":"%s","version":0},{"id":"%s","version":99}]}
                """.formatted(first.getId(), second.getId());

        mockMvc.perform(post("/api/v1/catalog/bulk/activation").header("Authorization", bearer(customer))
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/catalog/bulk/activation").header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requested").value(2))
                .andExpect(jsonPath("$.succeeded").value(1)).andExpect(jsonPath("$.failed").value(1))
                .andExpect(jsonPath("$.outcomes[0].success").value(true))
                .andExpect(jsonPath("$.outcomes[1].success").value(false));
    }

    private CatalogItem item(String name) {
        CatalogItem item = new CatalogItem(); item.setName(name); item.setType(ItemType.PRODUCT);
        item.setPrice(BigDecimal.TEN); item.setActive(true); return catalog.saveAndFlush(item);
    }
    private User user(Role role) {
        return users.saveAndFlush(new User(role.name(), role + "-bulk-" + UUID.randomUUID() + "@example.test",
                encoder.encode("StrongPass1!"), role, true, null));
    }
    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return new tools.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsByteArray()).get("token").asText();
    }
    private String bearer(String token) { return "Bearer " + token; }
}
