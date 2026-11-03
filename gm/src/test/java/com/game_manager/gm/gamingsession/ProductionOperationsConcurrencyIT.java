package com.game_manager.gm.gamingsession;
import org.springframework.test.context.*;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
/** The same update/start, quiescence/payment and resource-scope contracts on real InnoDB. */
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class ProductionOperationsConcurrencyIT extends ProductionOperationsIntegrationTest {
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.4").withDatabaseName("production_operations_it").withUsername("pilot").withPassword("disposable-production-operations-password").withEnv("TZ","UTC").withUrlParam("serverTimezone","UTC");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
        registry.add("spring.datasource.url",MYSQL::getJdbcUrl);registry.add("spring.datasource.username",MYSQL::getUsername);
        registry.add("spring.datasource.password",MYSQL::getPassword);registry.add("spring.datasource.driver-class-name",MYSQL::getDriverClassName);
    }
}
