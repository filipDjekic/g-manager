package com.game_manager.gm.idempotency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.order.OrderRepository;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class IdempotencyConcurrencyIT {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gmanager").withUsername("gmanager_it")
            .withPassword("ephemeral-test-password").withEnv("TZ", "UTC").withUrlParam("serverTimezone", "UTC");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository users;
    @Autowired CatalogRepository catalog;
    @Autowired OrderRepository orders;
    @Autowired PasswordEncoder encoder;

    @Test
    void twentyConcurrentIdenticalRequestsCreateExactlyOneOrderAcrossRepeatedRounds() throws Exception {
        CatalogItem product = new CatalogItem(); product.setName("Concurrent product");
        product.setType(ItemType.PRODUCT); product.setPrice(BigDecimal.TEN); product.setActive(true);
        product = catalog.saveAndFlush(product);
        String body = "{\"items\":[{\"productId\":\"%s\",\"quantity\":1}]}".formatted(product.getId());

        for (int round = 0; round < 3; round++) {
            // Keep each wave below the real 30/minute admission limit; do not disable rate limiting.
            User customer = users.saveAndFlush(new User("Concurrency Customer",
                    "concurrency-" + UUID.randomUUID() + "@example.test",
                    encoder.encode("StrongPass1!"), Role.CUSTOMER, true, null));
            String token = login(customer);
            long before = orders.count();
            String key = UUID.randomUUID().toString();
            CountDownLatch start = new CountDownLatch(1);
            try (var executor = Executors.newFixedThreadPool(20)) {
                List<java.util.concurrent.Future<MvcResult>> futures = java.util.stream.IntStream.range(0, 20)
                        .mapToObj(index -> executor.submit(() -> {
                            start.await();
                            return mockMvc.perform(post("/api/v1/orders")
                                    .header("Authorization", "Bearer " + token)
                                    .header("Idempotency-Key", key)
                                    .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
                        })).toList();
                start.countDown();
                List<MvcResult> results = futures.stream().map(future -> {
                    try { return future.get(); }
                    catch (Exception exception) { throw new RuntimeException(exception); }
                }).toList();
                assertThat(results).allMatch(result -> result.getResponse().getStatus() == 201
                        || result.getResponse().getStatus() == 425);
                assertThat(results).anyMatch(result -> result.getResponse().getStatus() == 201);
                List<MvcResult> completed = new java.util.ArrayList<>();
                for (MvcResult result : results) {
                    if (result.getResponse().getStatus() == 425) {
                        assertThat(result.getResponse().getHeader("Retry-After")).isEqualTo("2");
                    } else completed.add(result);
                }
                if (completed.size() != results.size()) {
                    Thread.sleep(2000); // Honor the protocol's Retry-After, after the winning request completed.
                    MvcResult replay = mockMvc.perform(post("/api/v1/orders")
                            .header("Authorization", "Bearer " + token).header("Idempotency-Key", key)
                            .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
                    assertThat(replay.getResponse().getStatus()).isEqualTo(201);
                    assertThat(replay.getResponse().getHeader("Idempotency-Replayed")).isEqualTo("true");
                    completed.add(replay);
                }
                assertThat(results).hasSize(20);
                assertThat(completed.stream().map(result -> new String(
                                result.getResponse().getContentAsByteArray(), java.nio.charset.StandardCharsets.UTF_8))
                        .distinct())
                        .hasSize(1);
            }
            assertThat(orders.count()).isEqualTo(before + 1);
        }
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return new tools.jackson.databind.ObjectMapper().readTree(
                result.getResponse().getContentAsByteArray()).get("token").asText();
    }
}
