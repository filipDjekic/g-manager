package com.game_manager.gm.migration;

import com.game_manager.gm.testsupport.GamingTimeMigrationContract;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;

@Testcontainers
class GamingTimeMigrationIT extends GamingTimeMigrationContract {
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("time_upgrade").withUsername("root").withPassword("disposable-upgrade-test-password");
    @Override protected SingleConnectionDataSource database() {
        String schema="time_upgrade_"+UUID.randomUUID().toString().replace("-","");
        var admin=new SingleConnectionDataSource(MYSQL.getJdbcUrl(),MYSQL.getUsername(),MYSQL.getPassword(),true);
        try { new JdbcTemplate(admin).execute("CREATE DATABASE "+schema); } finally { admin.destroy(); }
        return new SingleConnectionDataSource(MYSQL.getJdbcUrl().replace("/time_upgrade","/"+schema),MYSQL.getUsername(),MYSQL.getPassword(),true);
    }
}
