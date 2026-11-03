package com.game_manager.gm.gamingsession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
/** Repeats the finance, guest and concurrency contracts using disposable MySQL/InnoDB. */
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class GamingBillingConcurrencyIT extends GamingBillingIntegrationTest {
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gaming_operations_it").withUsername("gaming_it").withPassword("disposable-test-password")
            .withEnv("TZ","UTC").withUrlParam("serverTimezone","UTC");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",MYSQL::getJdbcUrl);r.add("spring.datasource.username",MYSQL::getUsername);
        r.add("spring.datasource.password",MYSQL::getPassword);r.add("spring.datasource.driver-class-name",MYSQL::getDriverClassName);
    }
}
