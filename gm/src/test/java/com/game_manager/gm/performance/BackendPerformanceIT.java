package com.game_manager.gm.performance;

import static org.assertj.core.api.Assertions.assertThat;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.machine.*;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.security.JwtService;
import com.game_manager.gm.station.*;
import com.game_manager.gm.user.*;
import jakarta.persistence.EntityManagerFactory;
import java.lang.management.ManagementFactory;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.test.context.*;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import tools.jackson.databind.ObjectMapper;

/** Bounded real-HTTP measurements. Starts its own disposable MySQL; never accepts an external URL. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "logging.level.org.hibernate.stat=ERROR",
        "logging.level.org.hibernate.engine.internal.StatisticalLoggingSessionEventListener=ERROR"
})
@ActiveProfiles("test")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class BackendPerformanceIT {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gmanager_audit").withUsername("audit")
            .withPassword("disposable-audit-password").withEnv("TZ", "UTC")
            .withUrlParam("serverTimezone", "UTC").withUrlParam("rewriteBatchedStatements", "true")
            .withCommand("--performance-schema=ON");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @LocalServerPort int port;
    @Autowired UserRepository users;
    @Autowired CatalogRepository catalog;
    @Autowired LocationRepository locations;
    @Autowired AreaRepository areas;
    @Autowired PhysicalResourceRepository resources;
    @Autowired GamingStationProfileRepository stations;
    @Autowired GamingSessionRepository sessions;
    @Autowired StationMachineIdentityRepository identities;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired ScheduledAnnotationBeanPostProcessor scheduler;
    @Autowired ObjectMapper json;
    @Autowired org.springframework.context.ApplicationContext applicationContext;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Test
    void measureBoundedCriticalReads() throws Exception {
        // Cancel only this test context's scheduled tasks, excluding unrelated polling from SQL counts.
        scheduler.getScheduledTasks().forEach(task -> task.cancel());
        User owner = users.saveAndFlush(new User("Audit Owner", "audit-owner@example.test", "unused",
                Role.OWNER, true, null));
        User customer = users.saveAndFlush(new User("Audit Customer", "audit-customer@example.test", "unused",
                Role.CUSTOMER, true, null));
        CatalogItem service = new CatalogItem();
        service.setName("Audit gaming"); service.setType(ItemType.SERVICE);
        service.setPrice(BigDecimal.TEN); service.setDurationMinutes(60); service.setActive(true);
        service = catalog.saveAndFlush(service);
        Location location = new Location(); location.setCode("AUDIT"); location.setName("Audit");
        location.setAddress("Test"); location.setTimezone("Europe/Belgrade"); location.setActive(true);
        location = locations.saveAndFlush(location);
        Area area = new Area(); area.setLocationId(location.getId()); area.setCode("AUDIT");
        area.setName("Audit"); area.setActive(true); area = areas.saveAndFlush(area);
        PhysicalResource first = null;
        for (int i = 0; i < 32; i++) {
            PhysicalResource pc = new PhysicalResource(); pc.setAreaId(area.getId());
            pc.setServiceId(service.getId()); pc.setCode("AUDIT-" + i); pc.setName("PC " + i);
            pc.setType(ResourceType.GAMING_PC); pc.setActive(true); pc.setBookable(true);
            pc = resources.saveAndFlush(pc);
            GamingStationProfile profile = new GamingStationProfile(); profile.setResourceId(pc.getId());
            profile.setOperationalStatus(i == 31 ? StationOperationalStatus.MAINTENANCE : StationOperationalStatus.AVAILABLE);
            stations.saveAndFlush(profile);
            if (first == null) first = pc;
        }
        Instant from = Instant.parse("2030-01-01T10:00:00Z"), to = from.plusSeconds(3600);
        GamingSession session = new GamingSession(); session.setResourceId(first.getId());
        session.setLocationId(location.getId()); session.setCustomerId(customer.getId());
        session.setStartedBy(owner.getId()); session.setStartedAt(from); session.setEndsAt(to);
        session.setStatus(GamingSessionStatus.ACTIVE); session = sessions.saveAndFlush(session);
        StationMachineIdentity identity = new StationMachineIdentity(); identity.setStationId(first.getId());
        identity.setPublicKeyBase64("unused-in-bearer-read"); identity.setPublicKeyFingerprint("a".repeat(64));
        identity.setKeyVersion(1L); identity.setStatus(MachineIdentityStatus.ACTIVE);
        identity.setEnrolledAt(Instant.now()); identity.setEnrolledBy(owner.getId()); identity = identities.saveAndFlush(identity);
        UUID stationId = first.getId(), sessionId = session.getId();
        Instant now = Instant.now();
        jdbc.batchUpdate("""
                INSERT INTO station_commands (id,station_id,session_id,sequence,command_type,payload_version,
                payload,correlation_id,available_at,expires_at,created_at,updated_at,version)
                VALUES (?,?,?,?,'SESSION_EXTENDED',1,'{}','audit',?,?,?,?,0)
                """, java.util.stream.IntStream.rangeClosed(1, 5000).boxed().toList(), 250, (statement, sequence) -> {
                    statement.setString(1, UUID.randomUUID().toString()); statement.setString(2, stationId.toString());
                    statement.setString(3, sessionId.toString()); statement.setLong(4, sequence);
                    // Future command must not consume the 100 available-response slots.
                    statement.setTimestamp(5, Timestamp.from(sequence == 1 ? now.plusSeconds(86400) : now.minusSeconds(1)));
                    statement.setTimestamp(6, Timestamp.from(sequence == 2 ? now.minusSeconds(1) : now.plusSeconds(86400)));
                    statement.setTimestamp(7, Timestamp.from(now.minusSeconds(60))); statement.setTimestamp(8, Timestamp.from(now));
                });
        String ownerToken = jwt.issue(owner.getId()).value();
        String machineToken = jwt.issueMachine(identity.getId(), stationId, 1).value();
        String availability = "/api/v1/resources/areas/" + area.getId() + "/availability?start=" + from + "&end=" + to;
        String poll = "/api/v1/machine/commands?afterSequence=0";
        var values = json.readTree(request(availability, ownerToken).body());
        assertThat(values.size()).isEqualTo(32);
        List<String> statuses = new ArrayList<>();
        values.forEach(value -> statuses.add(value.get("status").asText()));
        assertThat(statuses).contains("OCCUPIED", "MAINTENANCE", "AVAILABLE");
        var commands = json.readTree(request(poll, machineToken).body());
        assertThat(commands.size()).isEqualTo(100);
        assertThat(commands.get(0).get("sequence").asLong()).isEqualTo(2);
        assertThat(commands.get(0).get("expired").asBoolean()).isTrue();
        assertThat(commands.get(99).get("sequence").asLong()).isEqualTo(101);
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("environment", Map.of("database", "mysql:8.4 disposable Testcontainer", "java", System.getProperty("java.version"),
                "resources", 32, "commandBacklog", 5000, "warmupPerFlow", 8, "serialSamples", 24, "concurrentSamples", 48, "concurrency", 4,
                "statisticsEnabled", true));
        report.put("availability", measure(availability, ownerToken));
        report.put("commandPoll", measure(poll, machineToken));
        Path output = Path.of("target", "backend-performance-" + System.getProperty("audit.label", "baseline") + ".json");
        Files.writeString(output, json.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        var mappings = applicationContext.getBean("requestMappingHandlerMapping",
                org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping.class);
        List<Map<String, Object>> endpoints = new ArrayList<>();
        mappings.getHandlerMethods().forEach((mapping, handler) -> {
            if (handler.getBeanType().getPackageName().startsWith("com.game_manager.gm")) {
                for (String route : mapping.getPatternValues()) {
                    endpoints.add(Map.of("route", route, "methods", mapping.getMethodsCondition().getMethods().stream()
                            .map(Enum::name).sorted().toList(), "controller", handler.getBeanType().getSimpleName(),
                            "handler", handler.getMethod().getName()));
                }
            }
        });
        endpoints.sort(Comparator.comparing(endpoint -> String.valueOf(endpoint.get("route"))));
        Files.writeString(Path.of("target", "backend-api-inventory.json"), json.writerWithDefaultPrettyPrinter().writeValueAsString(endpoints));
        System.out.println("Audit measurements: " + output.toAbsolutePath());
    }

    private Map<String, Object> measure(String path, String token) throws Exception {
        for (int i = 0; i < 8; i++) request(path, token);
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        SqlSample before = sqlSample(); request(path, token); SqlSample after = sqlSample();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("singleRequest", Map.of("ormStatements", statistics.getPrepareStatementCount(),
                "entitiesLoaded", statistics.getEntityLoadCount(), "mysqlStatements", after.count() - before.count(),
                "mysqlStatementTimeMs", (after.picoseconds() - before.picoseconds()) / 1_000_000_000.0));
        result.put("serial", batch(path, token, 1, 24));
        result.put("concurrent", batch(path, token, 4, 48));
        return result;
    }

    private Map<String, Object> batch(String path, String token, int concurrency, int samples) throws Exception {
        var os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        long cpu = os.getProcessCpuTime(), started = System.nanoTime();
        List<Double> times = new ArrayList<>();
        try (var executor = Executors.newFixedThreadPool(concurrency)) {
            List<Callable<Double>> calls = java.util.stream.IntStream.range(0, samples).mapToObj(i -> (Callable<Double>) () -> {
                long begin = System.nanoTime(); request(path, token); return (System.nanoTime() - begin) / 1_000_000.0;
            }).toList();
            for (Future<Double> future : executor.invokeAll(calls, 60, TimeUnit.SECONDS)) times.add(future.get());
        }
        Collections.sort(times);
        return Map.of("samples", samples, "concurrency", concurrency, "p50Ms", percentile(times, .50),
                "p95Ms", percentile(times, .95), "p99Ms", percentile(times, .99),
                "wallMs", (System.nanoTime() - started) / 1_000_000.0,
                "backendCpuMs", (os.getProcessCpuTime() - cpu) / 1_000_000.0,
                "heapUsedBytesAtEnd", ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed(),
                "liveThreadsAtEnd", ManagementFactory.getThreadMXBean().getThreadCount());
    }

    private double percentile(List<Double> values, double percentile) {
        return values.get((int) Math.ceil(values.size() * percentile) - 1);
    }

    private HttpResponse<String> request(String path, String token) throws Exception {
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10)).header("Authorization", "Bearer " + token).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as(path).isEqualTo(200);
        return response;
    }

    private SqlSample sqlSample() throws Exception {
        try (Connection connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), "root", MYSQL.getPassword());
             Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("""
                     SELECT COALESCE(SUM(COUNT_STAR),0),COALESCE(SUM(SUM_TIMER_WAIT),0)
                     FROM performance_schema.events_statements_summary_by_digest
                     WHERE SCHEMA_NAME='gmanager_audit' AND DIGEST_TEXT NOT LIKE '%performance_schema%'
                     """)) {
            rows.next(); return new SqlSample(rows.getLong(1), rows.getLong(2));
        }
    }

    private record SqlSample(long count, long picoseconds) {}
}
