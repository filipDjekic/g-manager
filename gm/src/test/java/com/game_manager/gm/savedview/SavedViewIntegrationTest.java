package com.game_manager.gm.savedview;

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

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SavedViewIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwordEncoder;

    @Test
    void viewsArePrivateAndVersionSafe() throws Exception {
        String first = login(createUser("first"));
        String second = login(createUser("second"));
        MvcResult created = mockMvc.perform(post("/api/v1/saved-views")
                        .header("Authorization", bearer(first)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"resourceType":"ORDERS","name":"Hitno",
                                 "query":{"status":"CREATED","page":"2"}}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.version").value(0)).andReturn();
        var node = new tools.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsByteArray());
        String id = node.get("id").asText();

        mockMvc.perform(get("/api/v1/saved-views?resourceType=ORDERS").header("Authorization", bearer(second)))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        mockMvc.perform(patch("/api/v1/saved-views/{id}", id).header("Authorization", bearer(second))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"resourceType":"ORDERS","name":"Tuđ","query":{},"version":0}
                                """))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/v1/saved-views/{id}", id).header("Authorization", bearer(first))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"resourceType":"ORDERS","name":"Novo","query":{"status":"READY"},"version":0}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mockMvc.perform(delete("/api/v1/saved-views/{id}?version=0", id).header("Authorization", bearer(first)))
                .andExpect(status().isConflict());
    }

    private User createUser(String prefix) {
        User user = new User(prefix, prefix + "-views-" + UUID.randomUUID() + "@example.test",
                passwordEncoder.encode("StrongPass1!"), Role.CUSTOMER, true, null);
        return users.saveAndFlush(user);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return new tools.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsByteArray())
                .get("token").asText();
    }
    private String bearer(String token) { return "Bearer " + token; }
}
