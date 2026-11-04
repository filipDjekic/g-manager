package com.game_manager.gm.gamingsession;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Exercise the same metered contracts against real InnoDB locks and Flyway SQL. */
@Testcontainers
class MeteredGamingMySqlIT extends MeteredGamingIntegrationTest {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("metered_gaming_it")
            .withUsername("metered_it").withPassword("disposable-test-password")
            .withEnv("TZ", "UTC").withUrlParam("serverTimezone", "UTC");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", MYSQL::getJdbcUrl);
        properties.add("spring.datasource.username", MYSQL::getUsername);
        properties.add("spring.datasource.password", MYSQL::getPassword);
        properties.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }
}
