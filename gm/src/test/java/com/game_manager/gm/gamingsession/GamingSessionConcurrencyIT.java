package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Run the lifecycle, concurrent admission and authorization contract against InnoDB as well as H2. */
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class GamingSessionConcurrencyIT extends GamingSessionIntegrationTest {
    private static final KeyPair POLICY_KEY = keyPair();
    @org.springframework.beans.factory.annotation.Autowired com.game_manager.gm.security.JwtService jwt;
    @org.springframework.beans.factory.annotation.Autowired com.game_manager.gm.gamingsession.command.StationCommandWriter commandWriter;
    @org.springframework.beans.factory.annotation.Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @org.springframework.beans.factory.annotation.Autowired ObjectMapper protocolJson;
    @org.springframework.beans.factory.annotation.Autowired
    com.game_manager.gm.gamingsession.job.GamingSessionReconciliationJobHandler reconciliation;
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gmanager_gaming_it").withUsername("gaming_it").withPassword("disposable-test-password")
            .withEnv("TZ", "UTC").withUrlParam("serverTimezone", "UTC")
            .withUrlParam("rewriteBatchedStatements", "true");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
        registry.add("app.gaming-client.policy-signing-private-key", () -> Base64.getEncoder().encodeToString(POLICY_KEY.getPrivate().getEncoded()));
        registry.add("app.gaming-client.policy-signing-key-id", () -> "ephemeral-protocol-test");
    }

    @org.junit.jupiter.api.Test
    void realMachineEnrollmentHeartbeatSignedLeaseAckAndRevocation() throws Exception {
        var owner = user(com.game_manager.gm.common.security.Role.OWNER);
        var customer = user(com.game_manager.gm.common.security.Role.CUSTOMER);
        var station = station(); UUID stationId = station.resource().getId();
        var profile = stations.findByResourceId(stationId).orElseThrow(); profile.setClientEnabled(true); stations.saveAndFlush(profile);
        String ownerToken = jwt.issue(owner.getId()).value(); KeyPair machineKey = keyPair();
        String adminPath = "/api/v1/stations/" + stationId + "/machine-identity";
        JsonNode enrollment = exchange(post(adminPath + "/enrollment-token"), ownerToken, null, 201);
        Map<String, Object> enrollBody = Map.of("enrollmentToken", enrollment.get("enrollmentToken").asText(),
                "publicKeyBase64", Base64.getEncoder().encodeToString(machineKey.getPublic().getEncoded()), "clientVersion", "audit-test");
        JsonNode identity = exchange(post("/api/v1/machine/enroll"), null, enrollBody, 201);
        exchange(post("/api/v1/machine/enroll"), null, enrollBody, 401);
        String identityId = identity.get("identityId").asText();
        JsonNode challenge = exchange(post("/api/v1/machine/auth/challenge"), null, Map.of("identityId", identityId), 200);
        String signed = challenge.get("challengeId").asText() + ":" + identityId + ":" + challenge.get("nonce").asText();
        Signature signature = Signature.getInstance("Ed25519"); signature.initSign(machineKey.getPrivate());
        signature.update(signed.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        Map<String, Object> authBody = Map.of("identityId", identityId, "challengeId", challenge.get("challengeId").asText(),
                "nonce", challenge.get("nonce").asText(), "signature", Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign()));
        String token = exchange(post("/api/v1/machine/auth/token"), null, authBody, 200).get("token").asText();
        exchange(post("/api/v1/machine/auth/token"), null, authBody, 401);
        exchange(post("/api/v1/machine/heartbeat"), token,
                Map.of("clientVersion", "audit-test", "status", "LOCKED", "lastCommandSequence", 0), 204);
        assertThat(exchange(get("/api/v1/machine/snapshot"), token, null, 200).get("stationId").asText()).isEqualTo(stationId.toString());
        verifyEnvelope(exchange(get("/api/v1/machine/configuration"), token, null, 200));
        JsonNode lease = verifyEnvelope(exchange(get("/api/v1/machine/lease"), token, null, 200));
        assertThat(lease.get("directive").asText()).isEqualTo("LOCK");

        GamingSession terminal = new GamingSession(); terminal.setCustomerId(customer.getId()); terminal.setStartedBy(owner.getId());
        terminal.setResourceId(stationId); terminal.setLocationId(station.locationId()); Instant now = Instant.now();
        terminal.setStartedAt(now.minusSeconds(3600)); terminal.setEndsAt(now.plusSeconds(3600)); terminal.setEndedAt(now);
        terminal.setStatus(GamingSessionStatus.TERMINATED); terminal.setTerminationReason("Protocol fixture");
        terminal = sessions.saveAndFlush(terminal); GamingSession value = terminal;
        long sequence = new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status -> {
            long result = commandWriter.write(value, com.game_manager.gm.gamingsession.command.StationCommandType.SESSION_TERMINATED);
            sessions.saveAndFlush(value); return result;
        });
        JsonNode commands = exchange(get("/api/v1/machine/commands?afterSequence=0"), token, null, 200);
        assertThat(commands.size()).isEqualTo(1); assertThat(commands.get(0).get("sequence").asLong()).isEqualTo(sequence);
        exchange(post("/api/v1/machine/commands/" + sequence + "/ack"), token, Map.of(), 200);
        JsonNode ack = exchange(post("/api/v1/machine/enforcement/lock-ack"), token,
                Map.of("sessionId", terminal.getId(), "commandSequence", sequence, "reason", "Synthetic server protocol check"), 200);
        assertThat(ack.get("enforcementStatus").asText()).isEqualTo("LOCKED");
        exchange(get("/api/v1/machine/lease"), token, null, 200);
        exchange(get("/api/v1/machine/lease"), token, null, 200);
        exchange(post("/api/v1/machine/heartbeat"),token,Map.of("clientVersion","audit-test","status","LOCKED","lastCommandSequence",sequence,"enforcementStatus","LOCKED"),204);
        var board=exchange(get("/api/v1/gaming-operations/board"),ownerToken,null,200);
        assertThat(board.get("stations").get(0).get("enforcementStatus").asText()).isEqualTo("LOCKED");
        assertThat(board.get("stations").get(0).get("status").asText()).isEqualTo("AVAILABLE");
        exchange(get("/api/v1/machine/lease"), ownerToken, null, 401);
        exchange(post(adminPath + "/revoke"), ownerToken, null, 204);
        exchange(get("/api/v1/machine/snapshot"), token, null, 401);
    }

    private JsonNode exchange(MockHttpServletRequestBuilder request, String token, Object body, int expected) throws Exception {
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (body != null) request.contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(protocolJson.writeValueAsString(body));
        byte[] response = mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse().getContentAsByteArray();
        return protocolJson.readTree(response.length == 0 ? "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8) : response);
    }

    private JsonNode verifyEnvelope(JsonNode envelope) throws Exception {
        byte[] payload = Base64.getUrlDecoder().decode(envelope.get("payload").asText());
        Signature verifier = Signature.getInstance("Ed25519"); verifier.initVerify(POLICY_KEY.getPublic()); verifier.update(payload);
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(envelope.get("signature").asText()))).isTrue();
        return protocolJson.readTree(payload);
    }

    private static KeyPair keyPair() {
        try { return KeyPairGenerator.getInstance("Ed25519").generateKeyPair(); }
        catch (GeneralSecurityException exception) { throw new ExceptionInInitializerError(exception); }
    }

    @org.junit.jupiter.api.Test
    void latestCommandSummaryUsesCommittedRowsDuringConcurrentWritesAndAck() throws Exception {
        var owner=user(com.game_manager.gm.common.security.Role.OWNER);
        var customer=user(com.game_manager.gm.common.security.Role.CUSTOMER);
        var station=station();UUID stationId=station.resource().getId();
        Instant now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        var session=new GamingSession();session.setResourceId(stationId);session.setLocationId(station.locationId());
        session.setCustomerId(customer.getId());session.setStartedBy(owner.getId());session.setStartedAt(now.minusSeconds(60));
        session.setEndsAt(now.plusSeconds(3600));session.setStatus(GamingSessionStatus.ACTIVE);
        UUID sessionId=sessions.saveAndFlush(session).getId();
        var transaction=new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        java.util.function.Supplier<Long> write=()->transaction.execute(status->{
            var locked=sessions.findByIdForUpdate(sessionId).orElseThrow();
            long sequence=commandWriter.write(locked,com.game_manager.gm.gamingsession.command.StationCommandType.SESSION_EXTENDED);
            sessions.saveAndFlush(locked);return sequence;
        });
        assertThat(write.get()).isEqualTo(1L);
        var staged=new java.util.concurrent.CountDownLatch(1);
        var commit=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var pending=pool.submit(()->transaction.execute(status->{
                var locked=sessions.findByIdForUpdate(sessionId).orElseThrow();
                long sequence=commandWriter.write(locked,com.game_manager.gm.gamingsession.command.StationCommandType.SESSION_EXTENDED);
                sessions.saveAndFlush(locked);staged.countDown();
                try { assertThat(commit.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue(); }
                catch(InterruptedException exception) { Thread.currentThread().interrupt();throw new IllegalStateException(exception); }
                return sequence;
            }));
            try {
                assertThat(staged.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                assertThat(stationCommands.findLatestSummariesByStationIdIn(List.of(stationId)))
                        .singleElement().extracting(com.game_manager.gm.gamingsession.command.StationCommandSummary::sequence).isEqualTo(1L);
                assertThat(stationCommands.currentCursor(stationId.toString())).isEqualTo(1L);
            } finally { commit.countDown(); }
            assertThat(pending.get(10,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(2L);
            var first=pool.submit(write::get);var second=pool.submit(write::get);
            assertThat(List.of(first.get(10,java.util.concurrent.TimeUnit.SECONDS),second.get(10,java.util.concurrent.TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(3L,4L);
        }
        assertThat(stationCommands.findByStationIdAndSequenceGreaterThanOrderBySequence(stationId,0L))
                .extracting(com.game_manager.gm.gamingsession.command.StationCommand::getSequence).containsExactly(1L,2L,3L,4L);
        jdbc.update("UPDATE station_commands SET acknowledged_at=? WHERE station_id=? AND sequence=4",
                java.sql.Timestamp.from(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS)),stationId.toString());
        var tip=stationCommands.findLatestSummariesByStationIdIn(List.of(stationId)).getFirst();
        assertThat(tip.sequence()).isEqualTo(4L);assertThat(tip.acknowledgedAt()).isNotNull();
        transaction.executeWithoutResult(status->{
            var locked=sessions.findByIdForUpdate(sessionId).orElseThrow();
            assertThat(commandWriter.write(locked,com.game_manager.gm.gamingsession.command.StationCommandType.SESSION_EXTENDED)).isEqualTo(5L);
            status.setRollbackOnly();
        });
        assertThat(stationCommands.findLatestSummariesByStationIdIn(List.of(stationId))).containsExactly(tip);
        assertThat(stationCommands.currentCursor(stationId.toString())).isEqualTo(4L);
    }

    @org.junit.jupiter.api.Test
    void reconciliationPagesCurrentIdsSkipsOldHistoryAndRepairsOnlyOnce() {
        var owner = user(com.game_manager.gm.common.security.Role.OWNER);
        var customer = user(com.game_manager.gm.common.security.Role.CUSTOMER);
        var station = station();
        java.time.Instant now = java.time.Instant.now();
        java.util.Set<java.util.UUID> expected = new java.util.HashSet<>();
        for (int i = 0; i < 111; i++) {
            var value = new GamingSession(); value.setCustomerId(customer.getId()); value.setStartedBy(owner.getId());
            value.setResourceId(station.resource().getId()); value.setLocationId(station.locationId());
            java.time.Instant end = now.minusSeconds((i == 110 ? 90L * 24 : i + 1) * 3600);
            value.setStartedAt(end.minusSeconds(3600)); value.setEndsAt(end); value.setEndedAt(end);
            value.setStatus(GamingSessionStatus.EXPIRED); value = sessions.saveAndFlush(value);
            if (i < 110) expected.add(value.getId());
        }
        var first = sessions.findReconciliationIds(now.minus(java.time.Duration.ofDays(30)), null,
                org.springframework.data.domain.PageRequest.of(0, 100));
        var second = sessions.findReconciliationIds(now.minus(java.time.Duration.ofDays(30)), first.getLast(),
                org.springframework.data.domain.PageRequest.of(0, 100));
        org.assertj.core.api.Assertions.assertThat(first).hasSize(100);
        org.assertj.core.api.Assertions.assertThat(second).hasSize(10);
        java.util.List<java.util.UUID> all = new java.util.ArrayList<>(first); all.addAll(second);
        org.assertj.core.api.Assertions.assertThat(all).containsExactlyInAnyOrderElementsOf(expected);
        var context = org.mockito.Mockito.mock(com.game_manager.gm.jobs.JobContext.class);
        reconciliation.handle(org.mockito.Mockito.mock(com.game_manager.gm.jobs.JobRecord.class), context);
        long commands = stationCommands.count();
        org.assertj.core.api.Assertions.assertThat(commands).isEqualTo(110);
        reconciliation.handle(org.mockito.Mockito.mock(com.game_manager.gm.jobs.JobRecord.class), context);
        org.assertj.core.api.Assertions.assertThat(stationCommands.count()).isEqualTo(commands);
    }
}
