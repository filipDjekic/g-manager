package com.game_manager.gm.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.OptimisticLockException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class MySqlSchemaIT {
    private static final Logger log = LoggerFactory.getLogger(MySqlSchemaIT.class);

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gmanager")
            .withUsername("gmanager_it")
            .withPassword("ephemeral-test-password")
            .withEnv("TZ", "UTC");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired EntityManagerFactory entityManagerFactory;

    @Test
    @Order(1)
    void upgradesPreviousVersionToLatest() {
        long startedAt = System.nanoTime();
        cleanSchema();
        Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .target(MigrationVersion.fromVersion("27"))
                .load()
                .migrate();

        assertThat(currentVersion()).isEqualTo("27");
        flyway.migrate();

        assertThat(currentVersion()).isEqualTo("32");
        log.info("MySQL V27-to-latest migration completed in {} ms", elapsedMillis(startedAt));
    }

    @Test
    @Order(2)
    void migratesEmptySchemaAndHibernateValidatesIt() {
        long startedAt = System.nanoTime();
        cleanSchema();
        assertThat(flyway.migrate().success).isTrue();
        assertThat(currentVersion()).isEqualTo("32");
        assertThat(entityManagerFactory.getMetamodel().getEntities()).isNotEmpty();
        log.info("MySQL empty-to-latest migration completed in {} ms", elapsedMillis(startedAt));
    }

    @Test
    @Order(3)
    void exposesCriticalConstraintsAndIndexes() {
        assertThat(constraintNames("FOREIGN KEY"))
                .contains("fk_refresh_tokens_user", "fk_reservations_customer",
                        "fk_reservations_employee", "fk_reservations_service",
                        "fk_order_items_order", "fk_order_items_product",
                        "fk_resource_area", "fk_resource_service",
                        "fk_reservation_location", "fk_reservation_resource",
                        "fk_customer_activation_user", "fk_customer_activation_creator");
        assertThat(constraintNames("FOREIGN KEY"))
                .contains("fk_gaming_station_resource", "fk_gaming_station_application_profile",
                        "fk_profile_entry_profile", "fk_profile_entry_definition",
                        "fk_gaming_session_customer", "fk_gaming_session_resource",
                        "fk_gaming_session_location", "fk_gaming_session_started_by");
        assertThat(constraintNames("FOREIGN KEY"))
                .contains("fk_station_command_station", "fk_station_command_session",
                        "fk_station_command_sequence_station");
        assertThat(constraintNames("CHECK"))
                .contains("chk_catalog_price_positive", "chk_reservation_interval",
                        "chk_order_item_quantity");
        assertThat(indexNames("reservations"))
                .contains("idx_reservation_employee_time", "idx_reservation_status_time",
                        "idx_reservations_customer_status_time",
                        "idx_reservation_resource_time", "idx_reservation_location_time");
        assertThat(indexNames("physical_resources"))
                .contains("uk_resource_code", "idx_resource_service");
        assertThat(indexNames("orders"))
                .contains("idx_orders_customer_created", "idx_orders_status_created",
                        "idx_orders_handler_created");
        assertThat(indexNames("audit_events"))
                .contains("idx_audit_visibility_created");
        assertThat(indexNames("idempotency_keys"))
                .contains("uk_idempotency_principal_key_endpoint", "idx_idempotency_status_lease");
        assertThat(indexNames("outbox_events"))
                .contains("idx_outbox_claim", "idx_outbox_aggregate");
        assertThat(indexNames("background_jobs"))
                .contains("idx_background_jobs_claim", "idx_background_jobs_lease");
        assertThat(indexNames("customer_activation_tokens"))
                .contains("uk_customer_activation_token_hash", "idx_customer_activation_user");
        assertThat(indexNames("gaming_station_profiles"))
                .contains("uk_gaming_station_resource", "idx_gaming_station_status");
        assertThat(indexNames("gaming_sessions"))
                .contains("idx_gaming_session_resource_status", "idx_gaming_session_customer_status",
                        "idx_gaming_session_active_expiry");
        assertThat(indexNames("station_commands"))
                .contains("uk_station_command_sequence", "idx_station_command_cursor",
                        "idx_station_command_ack", "idx_station_command_retention",
                        "idx_station_command_session");

        Map<String, Object> plan = jdbc.queryForMap(
                "EXPLAIN SELECT * FROM reservations WHERE employee_id = ? AND status = ? "
                        + "AND start_time >= ? AND end_time <= ?",
                UUID.randomUUID().toString(), "CONFIRMED",
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now().plusSeconds(3600)));
        assertThat(plan.values()).anyMatch("idx_reservation_employee_time"::equals);
    }

    @Test
    @Order(4)
    void enforcesForeignKeysChecksUniqueKeysAndMicrosecondPrecision() {
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO catalog_items (id,name,type,price,active,created_at,updated_at,version) "
                        + "VALUES (?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), "Invalid", "PRODUCT", -1, true,
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now()), 0))
                .isInstanceOf(DataIntegrityViolationException.class);

        Instant precise = Instant.parse("2026-08-08T10:15:30.123456Z");
        String userId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO users (id,name,email,password_hash,role,active,created_at,updated_at,version) "
                        + "VALUES (?,?,?,?,?,?,?,?,?)",
                userId, "Precision", "precision@example.test", "hash", "CUSTOMER", true,
                Timestamp.from(precise), Timestamp.from(precise), 0);
        assertThat(jdbc.queryForObject("SELECT created_at FROM users WHERE id = ?", Timestamp.class, userId)
                .toInstant()).isEqualTo(precise);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO users (id,name,email,password_hash,role,active,created_at,updated_at,version) "
                        + "VALUES (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), "Duplicate", "precision@example.test", "hash",
                "CUSTOMER", true, Timestamp.from(precise), Timestamp.from(precise), 0))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO reservations (id,customer_id,employee_id,service_id,start_time,end_time,status,created_at,updated_at,version) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), userId, UUID.randomUUID().toString(),
                UUID.randomUUID().toString(), Timestamp.from(precise),
                Timestamp.from(precise.plusSeconds(3600)), "PENDING",
                Timestamp.from(precise), Timestamp.from(precise), 0))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Order(5)
    void repositoryQueriesUseRealMySql() {
        User user = new User("Repository User", "mysql-repository@example.test", "hash",
                Role.CUSTOMER, true, null);
        User saved = users.saveAndFlush(user);

        assertThat(users.findByEmailIgnoreCase("MYSQL-REPOSITORY@EXAMPLE.TEST"))
                .contains(saved);
    }

    @Test
    @Order(6)
    void rejectsARealConcurrentOptimisticUpdate() {
        User saved = users.saveAndFlush(new User("Original", "mysql-lock@example.test", "hash",
                Role.CUSTOMER, true, null));

        EntityManager first = entityManagerFactory.createEntityManager();
        EntityManager second = entityManagerFactory.createEntityManager();
        try {
            first.getTransaction().begin();
            second.getTransaction().begin();
            User firstCopy = first.find(User.class, saved.getId());
            User secondCopy = second.find(User.class, saved.getId());

            firstCopy.setName("First writer");
            first.getTransaction().commit();

            secondCopy.setName("Stale writer");
            assertThatThrownBy(second.getTransaction()::commit)
                    .hasRootCauseInstanceOf(OptimisticLockException.class);
        } finally {
            if (first.getTransaction().isActive()) first.getTransaction().rollback();
            if (second.getTransaction().isActive()) second.getTransaction().rollback();
            first.close();
            second.close();
        }
    }

    private void cleanSchema() {
        Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .cleanDisabled(false)
                .load()
                .clean();
    }

    private String currentVersion() {
        return jdbc.queryForObject(
                "SELECT version FROM flyway_schema_history WHERE success = 1 "
                        + "ORDER BY installed_rank DESC LIMIT 1", String.class);
    }

    private List<String> constraintNames(String type) {
        return jdbc.queryForList(
                "SELECT constraint_name FROM information_schema.table_constraints "
                        + "WHERE constraint_schema = DATABASE() AND constraint_type = ?",
                String.class, type);
    }

    private List<String> indexNames(String table) {
        return jdbc.queryForList(
                "SELECT DISTINCT index_name FROM information_schema.statistics "
                        + "WHERE table_schema = DATABASE() AND table_name = ?",
                String.class, table);
    }

    private long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }
}
