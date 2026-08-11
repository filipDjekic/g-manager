package com.game_manager.gm.search;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.order.Order;
import com.game_manager.gm.order.OrderRepository;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.jdbc.core.JdbcTemplate;
import testsupport.DatabaseCleaner;

import java.math.BigDecimal;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.hasSize;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SearchSecurityIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired UserRepository users;
    @Autowired CatalogRepository catalog;
    @Autowired OrderRepository orders;
    @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        DatabaseCleaner.clean(jdbc);
    }

    @Test
    void searchFiltersBeforeReturnAndDoesNotLeakForbiddenMetadata() throws Exception {
        User first = user(Role.CUSTOMER, "First Search Customer");
        User second = user(Role.CUSTOMER, "Second Hidden Customer");
        User employee = user(Role.EMPLOYEE, "Search Employee");
        User owner = user(Role.OWNER, "Hidden Search Owner");
        User admin = user(Role.ADMIN, "Search Admin");
        Order own = order(first.getId());
        Order foreign = order(second.getId());
        item("Visible Search Product", true);
        item("Forbidden Search Product", false);

        String firstToken = login(first);
        mockMvc.perform(get("/api/v1/search?q=CREATED").header("Authorization", bearer(firstToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[?(@.type == 'ORDER')]", hasSize(1)))
                .andExpect(jsonPath("$.results[0].action.kind").value("NAVIGATE"))
                .andExpect(jsonPath("$.results[?(@.id == '%s')]".formatted(own.getId())).exists())
                .andExpect(jsonPath("$.results[?(@.id == '%s')]".formatted(foreign.getId())).isEmpty());
        mockMvc.perform(get("/api/v1/search").queryParam("q", second.getEmail())
                        .header("Authorization", bearer(firstToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.results").isEmpty());
        mockMvc.perform(get("/api/v1/search").queryParam("q", "Forbidden Search").header("Authorization", bearer(firstToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.results").isEmpty());

        mockMvc.perform(get("/api/v1/search?q=CREATED").header("Authorization", bearer(login(employee))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.results[?(@.type == 'ORDER')]", hasSize(2)));
        mockMvc.perform(get("/api/v1/search").queryParam("q", "First Search").header("Authorization", bearer(login(owner))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.results[?(@.type == 'USER')]", hasSize(1)));
        mockMvc.perform(get("/api/v1/search").queryParam("q", "Hidden Search Owner").header("Authorization", bearer(login(admin))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.results").isEmpty());
    }

    @Test
    void favoritesAndRecentsAreOwnerIsolatedAndRevalidateVisibility() throws Exception {
        User first = user(Role.CUSTOMER, "Preference First");
        User second = user(Role.CUSTOMER, "Preference Second");
        Order own = order(first.getId());
        String firstToken = login(first);
        String secondToken = login(second);
        String request = "{\"type\":\"ORDER\",\"id\":\"%s\",\"favorite\":true}".formatted(own.getId());

        mockMvc.perform(post("/api/v1/search/preferences").header("Authorization", bearer(firstToken))
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk()).andExpect(jsonPath("$.favorite").value(true));
        mockMvc.perform(get("/api/v1/search/preferences?favoritesOnly=true").header("Authorization", bearer(firstToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(own.getId().toString()));
        mockMvc.perform(get("/api/v1/search/preferences?favoritesOnly=true").header("Authorization", bearer(secondToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        mockMvc.perform(post("/api/v1/search/preferences").header("Authorization", bearer(secondToken))
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isNotFound());
    }

    @Test
    void validatesAbuseAndCapsResults() throws Exception {
        String token = login(user(Role.OWNER, "Search Limit Owner"));
        mockMvc.perform(get("/api/v1/search?q=a").header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/search?q=Search&limit=999").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.limit").value(20));
    }

    private User user(Role role, String name) {
        return users.saveAndFlush(new User(name, name.toLowerCase().replace(' ', '-') + "-" + UUID.randomUUID() + "@example.test",
                encoder.encode("StrongPass1!"), role, true, null));
    }
    private Order order(UUID customerId) {
        Order order = new Order(); order.setCustomerId(customerId); order.setStatus(OrderStatus.CREATED);
        order.setTotalPrice(new BigDecimal("100.00")); return orders.saveAndFlush(order);
    }
    private void item(String name, boolean active) {
        CatalogItem item = new CatalogItem(); item.setName(name); item.setType(ItemType.PRODUCT);
        item.setPrice(BigDecimal.TEN); item.setActive(active); catalog.saveAndFlush(item);
    }
    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return new tools.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsByteArray()).get("token").asText();
    }
    private String bearer(String token) { return "Bearer " + token; }
}
