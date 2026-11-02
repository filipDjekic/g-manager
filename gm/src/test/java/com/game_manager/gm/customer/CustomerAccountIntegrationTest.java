package com.game_manager.gm.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.util.UUID;
import java.time.Instant;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
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
    @Autowired CustomerActivationHash activationHash;
    @Autowired CustomerActivationCleanup cleanup;
    @Autowired CustomerActivationGuard guard;
    @Autowired CustomerAccountService accounts;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void resetActivationQuotas() {
        jdbc.update("delete from customer_activation_guards where guard_key not in ('global', 'generation')");
        jdbc.update("update customer_activation_guards set attempts = 0");
    }

    @Test
    void employeeOwnsTheCustomerActivationLifecycle() throws Exception {
        String employeeToken = login(user(Role.EMPLOYEE));
        MvcResult created = mockMvc.perform(post("/api/v1/customers")
                        .header("Authorization", bearer(employeeToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Gaming Customer\",\"email\":\"gaming-%s@example.test\"}"
                                .formatted(UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.activationSecret").isString())
                .andExpect(jsonPath("$.role").doesNotExist()).andReturn();
        JsonNode body = json.readTree(created.getResponse().getContentAsByteArray());
        UUID id = UUID.fromString(body.get("id").asText());
        String secret = body.get("activationSecret").asText();
        assertThat(secret).matches("[A-Z0-9]{4}");
        assertThat(Instant.parse(body.get("activationExpiresAt").asText()))
                .isBetween(Instant.now().plusSeconds(3590), Instant.now().plusSeconds(3600));
        User customer = users.findById(id).orElseThrow();
        assertThat(customer.getRole()).isEqualTo(Role.CUSTOMER);
        assertThat(customer.isMustChangePassword()).isTrue();
        assertThat(activationTokens.findAll().stream().filter(token -> token.getUserId().equals(id))).singleElement()
                .satisfies(token -> assertThat(token.getTokenHash()).isEqualTo(activationHash.hash("code", secret)));

        mockMvc.perform(post("/api/v1/auth/activate").contentType(MediaType.APPLICATION_JSON)
                        .content(activationRequest(customer.getEmail(), secret))).andExpect(status().isNoContent());
        mockMvc.perform(post("/api/v1/auth/activate").contentType(MediaType.APPLICATION_JSON)
                        .content(activationRequest(customer.getEmail(), secret))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Activation code is invalid or expired"));

        customer = users.findById(id).orElseThrow();
        assertThat(customer.isMustChangePassword()).isFalse();
        assertThat(passwordEncoder.matches("CustomerPass1!", customer.getPasswordHash())).isTrue();
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
    void expiryWrongEmailRevocationAndUnknownCodesHaveTheSameResponse() throws Exception {
        JsonNode created = createCustomer(login(user(Role.EMPLOYEE)));
        UUID id = UUID.fromString(created.get("id").asText());
        String email = created.get("email").asText(), code = created.get("activationSecret").asText();
        String expected = "Activation code is invalid or expired";
        activate("wrong@example.test", code, "192.0.2.1")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(expected));
        new TransactionTemplate(transactions).executeWithoutResult(ignored -> {
            CustomerActivationToken token = activationTokens.findByHashForUpdate(activationHash.hash("code", code)).orElseThrow();
            token.setExpiresAt(Instant.now().minusSeconds(1));
            activationTokens.saveAndFlush(token);
        });
        activate(email, code, "192.0.2.2").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(expected));
        activate("unknown@example.test", "A7K2", "192.0.2.3").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(expected));
        assertThat(users.findById(id).orElseThrow().isMustChangePassword()).isTrue();
        new TransactionTemplate(transactions).executeWithoutResult(ignored -> {
            CustomerActivationToken token = activationTokens.findByHashForUpdate(activationHash.hash("code", code)).orElseThrow();
            token.setExpiresAt(Instant.now().plusSeconds(3600));
            token.setConsumedAt(Instant.now());
            activationTokens.saveAndFlush(token);
        });
        activate(email, code, "192.0.2.4").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(expected));
    }

    @Test
    void changingIpDoesNotBypassTheAccountLimitAndFailedAttemptsCommit() throws Exception {
        String email = "limited@example.test";
        for (int i = 0; i < 5; i++) {
            activate(email, "A7K2", "192.0.2." + i).andExpect(status().isBadRequest());
        }
        activate(email.toUpperCase(), "A7K2", "198.51.100.1").andExpect(status().isTooManyRequests());
        jdbc.update("update customer_activation_guards set window_started_at = ?",
                java.sql.Timestamp.from(Instant.now().minusSeconds(901)));
        activate(email, "A7K2", "198.51.100.1").andExpect(status().isBadRequest());
    }

    @Test
    void rejectsMalformedCodesAndMissingEmail() throws Exception {
        for (String code : List.of("", "A7K", "A7K22", "a7k2", "A-K2", "А7K2")) {
            activate(UUID.randomUUID() + "@example.test", code, "192.0.2.1").andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Activation code is invalid or expired"));
        }
        mockMvc.perform(post("/api/v1/auth/activate").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"activationSecret\":\"A7K2\",\"password\":\"CustomerPass1!\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void sharedIpAndGlobalQuotasApplyEvenWhenEmailAndIpAreRotated() {
        for (int i = 0; i < 10; i++) assertThat(guard.reserveAttempt("192.0.2.1", "ip-" + i + "@example.test")).isTrue();
        assertThat(guard.reserveAttempt("192.0.2.1", "different@example.test")).isFalse();
        for (int i = 10; i < 100; i++) {
            assertThat(guard.reserveAttempt("192.0.2." + i, "global-" + i + "@example.test")).isTrue();
        }
        assertThat(guard.reserveAttempt("198.51.100.1", "new@example.test")).isFalse();
    }

    @Test
    void multipleInstancesShareAnAtomicQuotaAndBlockedRequestsDoNotExtendTheWindow() throws Exception {
        Instant start = Instant.now();
        var time = java.time.Clock.fixed(start, java.time.ZoneOffset.UTC);
        var firstInstance = new CustomerActivationGuard(jdbc, activationHash, time);
        var secondInstance = new CustomerActivationGuard(jdbc, activationHash, time);
        try (var executor = Executors.newFixedThreadPool(8)) {
            var tasks = java.util.stream.IntStream.range(0, 20).mapToObj(i -> (Callable<Boolean>) () ->
                    new TransactionTemplate(transactions).execute(ignored ->
                            (i % 2 == 0 ? firstInstance : secondInstance).reserveAttempt("192.0.2." + i, "shared@example.test")))
                    .toList();
            int accepted = 0;
            for (var future : executor.invokeAll(tasks)) if (future.get()) accepted++;
            assertThat(accepted).isEqualTo(5);
        }
        String key = "email:" + activationHash.hash("email", "shared@example.test");
        Instant before = jdbc.queryForObject("select window_started_at from customer_activation_guards where guard_key = ?",
                java.sql.Timestamp.class, key).toInstant();
        var later = new CustomerActivationGuard(jdbc, activationHash,
                java.time.Clock.fixed(start.plusSeconds(899), java.time.ZoneOffset.UTC));
        Boolean blocked = new TransactionTemplate(transactions).execute(ignored -> later.reserveAttempt("new-ip", "shared@example.test"));
        assertThat(blocked).isFalse();
        assertThat(jdbc.queryForObject("select window_started_at from customer_activation_guards where guard_key = ?",
                java.sql.Timestamp.class, key).toInstant()).isEqualTo(before);
        var recovered = new CustomerActivationGuard(jdbc, activationHash,
                java.time.Clock.fixed(start.plusSeconds(900), java.time.ZoneOffset.UTC));
        Boolean allowed = new TransactionTemplate(transactions).execute(ignored -> recovered.reserveAttempt("new-ip", "shared@example.test"));
        assertThat(allowed).isTrue();
    }

    @Test
    void concurrentRequestsCanConsumeACodeOnlyOnce() throws Exception {
        JsonNode created = createCustomer(login(user(Role.EMPLOYEE)));
        String email = created.get("email").asText(), code = created.get("activationSecret").asText();
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> task = () -> {
                ready.countDown(); start.await();
                return activate(email, code, "192.0.2.1").andReturn().getResponse().getStatus();
            };
            var first = executor.submit(task);
            var second = executor.submit(task);
            boolean bothReady = ready.await(10, java.util.concurrent.TimeUnit.SECONDS);
            start.countDown();
            assertThat(bothReady).isTrue();
            assertThat(List.of(first.get(15, java.util.concurrent.TimeUnit.SECONDS),
                    second.get(15, java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(204, 400);
        } finally { start.countDown(); }
        assertThat(jdbc.queryForObject("select count(*) from security_events where user_id = ? "
                        + "and event_type = 'ACTIVATION_SUCCESS'", Integer.class, created.get("id").asText())).isOne();
    }

    @Test
    void activationAndItsSecurityEventRollBackTogether() throws Exception {
        JsonNode created = createCustomer(login(user(Role.EMPLOYEE)));
        UUID id = UUID.fromString(created.get("id").asText());
        String email = created.get("email").asText(), code = created.get("activationSecret").asText();
        String passwordHash = users.findById(id).orElseThrow().getPasswordHash();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            accounts.activate(email, code, "CustomerPass1!", "0".repeat(64));
            users.flush();
            assertThat(jdbc.queryForObject("select count(*) from security_events where user_id = ? "
                    + "and event_type = 'ACTIVATION_SUCCESS'", Integer.class, id.toString())).isOne();
            status.setRollbackOnly();
        });
        User customer = users.findById(id).orElseThrow();
        assertThat(customer.isMustChangePassword()).isTrue();
        assertThat(customer.getPasswordHash()).isEqualTo(passwordHash);
        assertThat(jdbc.queryForObject("select count(*) from security_events where user_id = ? "
                + "and event_type = 'ACTIVATION_SUCCESS'", Integer.class, id.toString())).isZero();
        activate(email, code, "192.0.2.1").andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from security_events where user_id = ? "
                + "and event_type = 'ACTIVATION_SUCCESS'", Integer.class, id.toString())).isOne();
    }

    @Test
    void concurrentCustomerCreationIssuesDifferentCodes() throws Exception {
        String staffToken = login(user(Role.EMPLOYEE));
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<JsonNode> task = () -> { start.await(); return createCustomer(staffToken); };
            var first = executor.submit(task);
            var second = executor.submit(task);
            start.countDown();
            JsonNode a = first.get(15, java.util.concurrent.TimeUnit.SECONDS);
            JsonNode b = second.get(15, java.util.concurrent.TimeUnit.SECONDS);
            assertThat(a.get("activationSecret").asText()).matches("[A-Z0-9]{4}")
                    .isNotEqualTo(b.get("activationSecret").asText());
        } finally { start.countDown(); }
    }

    @Test
    void deactivatedCustomerCannotActivateAndPasswordRemainsUnchanged() throws Exception {
        String staffToken = login(user(Role.EMPLOYEE));
        JsonNode created = createCustomer(staffToken);
        UUID id = UUID.fromString(created.get("id").asText());
        String passwordHash = users.findById(id).orElseThrow().getPasswordHash();
        mockMvc.perform(post("/api/v1/customers/{id}/deactivate", id).header("Authorization", bearer(staffToken)))
                .andExpect(status().isNoContent());
        activate(created.get("email").asText(), created.get("activationSecret").asText(), "192.0.2.1")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Activation code is invalid or expired"));
        assertThat(users.findById(id).orElseThrow().getPasswordHash()).isEqualTo(passwordHash);
    }

    @Test
    void cleanupKeepsActiveAndRecentTokensAndPreservesAuditAndSecurityEvents() throws Exception {
        JsonNode created = createCustomer(login(user(Role.EMPLOYEE)));
        UUID id = UUID.fromString(created.get("id").asText());
        activate(created.get("email").asText(), created.get("activationSecret").asText(), "192.0.2.1")
                .andExpect(status().isNoContent());
        Instant now = Instant.now(), cutoff = now.minus(Duration.ofDays(7));
        jdbc.update("update customer_activation_tokens set consumed_at = ? where user_id = ?",
                java.sql.Timestamp.from(cutoff.minusSeconds(60)), id.toString());
        CustomerActivationToken oldExpired = token(id, "old-expired", cutoff.minusSeconds(60), null);
        CustomerActivationToken recentExpired = token(id, "recent-expired", cutoff.plusSeconds(60), null);
        CustomerActivationToken recentUsed = token(id, "recent-used", now.plusSeconds(3600), cutoff.plusSeconds(60));
        CustomerActivationToken active = token(id, "active", now.plusSeconds(3600), null);
        int audits = jdbc.queryForObject("select count(*) from audit_events where resource_id = ?", Integer.class, id.toString());
        cleanup.cleanup();
        assertThat(activationTokens.existsById(oldExpired.getId())).isFalse();
        assertThat(activationTokens.findAll().stream().filter(value -> value.getUserId().equals(id))
                .map(CustomerActivationToken::getId)).containsExactlyInAnyOrder(recentExpired.getId(), recentUsed.getId(), active.getId());
        assertThat(jdbc.queryForObject("select count(*) from audit_events where resource_id = ?", Integer.class, id.toString()))
                .isEqualTo(audits);
        assertThat(jdbc.queryForObject("select count(*) from security_events where user_id = ? "
                + "and event_type = 'ACTIVATION_SUCCESS'", Integer.class, id.toString())).isOne();
    }

    private CustomerActivationToken token(UUID userId, String label, Instant expiry, Instant consumed) {
        CustomerActivationToken token = new CustomerActivationToken();
        token.setUserId(userId); token.setCreatedBy(userId);
        token.setTokenHash(activationHash.hash("test", label + UUID.randomUUID()));
        token.setExpiresAt(expiry); token.setConsumedAt(consumed);
        return activationTokens.saveAndFlush(token);
    }

    private JsonNode createCustomer(String staffToken) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/customers").header("Authorization", bearer(staffToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Customer\",\"email\":\"%s@example.test\"}".formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsByteArray());
    }

    private org.springframework.test.web.servlet.ResultActions activate(String email, String code, String ip) throws Exception {
        return mockMvc.perform(post("/api/v1/auth/activate").contentType(MediaType.APPLICATION_JSON)
                .content(activationRequest(email, code)).with(request -> { request.setRemoteAddr(ip); return request; }));
    }

    private static String activationRequest(String email, String code) {
        return "{\"email\":\"%s\",\"activationSecret\":\"%s\",\"password\":\"CustomerPass1!\"}".formatted(email, code);
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
