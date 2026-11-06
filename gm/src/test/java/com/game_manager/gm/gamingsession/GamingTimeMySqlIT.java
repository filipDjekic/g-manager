package com.game_manager.gm.gamingsession;
import org.springframework.test.context.*;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
@Testcontainers
class GamingTimeMySqlIT extends GamingTimeIntegrationTest {
 @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.4").withDatabaseName("gaming_time_it").withUsername("gaming_time").withPassword("disposable-time-test-password").withEnv("TZ","UTC").withUrlParam("serverTimezone","UTC");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",MYSQL::getJdbcUrl);r.add("spring.datasource.username",MYSQL::getUsername);r.add("spring.datasource.password",MYSQL::getPassword);r.add("spring.datasource.driver-class-name",MYSQL::getDriverClassName);}
}
