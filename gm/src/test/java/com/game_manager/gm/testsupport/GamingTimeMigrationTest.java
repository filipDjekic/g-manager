package com.game_manager.gm.testsupport;

import java.util.UUID;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

class GamingTimeMigrationTest extends GamingTimeMigrationContract {
    @Override protected SingleConnectionDataSource database() {
        return new SingleConnectionDataSource("jdbc:h2:mem:time_upgrade_"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;INIT=SET TIME ZONE 'UTC'","sa","",true);
    }
}
