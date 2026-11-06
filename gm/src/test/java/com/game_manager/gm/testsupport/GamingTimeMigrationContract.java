package com.game_manager.gm.testsupport;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

/** The same data-preservation contracts run on H2 and disposable MySQL 8.4. */
public abstract class GamingTimeMigrationContract {
    protected abstract SingleConnectionDataSource database();

    @Test
    void upgradesTheAppliedV48WithoutChangingItsHistoryOrExistingBusinessRecords() throws Exception {
        var source=database();
        try {
            var db=new JdbcTemplate(source);flyway(source,"47").migrate();
            var fixture=seed(db,true);
            flyway(source,"48").migrate();
            var history=db.queryForMap("SELECT * FROM flyway_schema_history WHERE version='48'");
            flyway(source,"49").migrate();
            consume(db,fixture,17);
            buyModernTime(db,fixture,1800);
            long before=balance(db,fixture.customer());
            var users=db.queryForList("SELECT * FROM users ORDER BY id");
            var sessions=db.queryForList("SELECT * FROM gaming_sessions ORDER BY id");
            var payments=db.queryForList("SELECT * FROM gaming_financial_operations ORDER BY id");
            var ledger=db.queryForList("SELECT * FROM gaming_time_ledger ORDER BY id");
            var packages=db.queryForList("SELECT * FROM gaming_time_packages ORDER BY id");
            assertThat(flyway(source,null).migrate().migrationsExecuted).isEqualTo(1);
            assertThat(balance(db,fixture.customer())).isEqualTo(before+1500);
            assertThat(db.queryForMap("SELECT * FROM flyway_schema_history WHERE version='48'")).isEqualTo(history);
            assertThat(db.queryForList("SELECT * FROM users ORDER BY id")).isEqualTo(users);
            assertThat(db.queryForList("SELECT * FROM gaming_sessions ORDER BY id")).isEqualTo(sessions);
            assertThat(db.queryForList("SELECT * FROM gaming_financial_operations ORDER BY id")).isEqualTo(payments);
            assertThat(db.queryForList("SELECT * FROM gaming_time_packages ORDER BY id")).isEqualTo(packages);
            assertThat(db.queryForList("SELECT * FROM gaming_time_ledger ORDER BY id")).containsAll(ledger).hasSize(ledger.size()+1);
            assertThat(db.queryForObject("SELECT SUM(amount) FROM gaming_wallet_ledger",BigDecimal.class)).isEqualByComparingTo("500");
            assertThat(db.queryForObject("SELECT minute_price FROM gaming_business_policy WHERE id=1",BigDecimal.class)).isNull();
            long after=balance(db,fixture.customer());
            var entries=db.queryForList("SELECT * FROM gaming_time_ledger ORDER BY id");
            // A retried DML backfill must not convert the package again, even after time was consumed.
            consume(db,fixture,11);after-=11;
            String sql=new ClassPathResource("db/migration/V50__preserve_unconverted_legacy_time.sql").getContentAsString(StandardCharsets.UTF_8);
            if("H2".equals(source.getConnection().getMetaData().getDatabaseProductName()))sql=sql.replace("START TRANSACTION;","BEGIN;");
            ScriptUtils.executeSqlScript(source.getConnection(),new EncodedResource(new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)),StandardCharsets.UTF_8),false,false,"--",";","/*","*/");
            assertThat(balance(db,fixture.customer())).isEqualTo(after);
            assertThat(db.queryForList("SELECT * FROM gaming_time_ledger ORDER BY id")).containsAll(entries).hasSize(entries.size()+1);
            assertThat(flyway(source,null).migrate().migrationsExecuted).isZero();
            flyway(source,null).validate();
            assertLedger(db);
        } finally { source.destroy(); }
    }

    @Test
    void doesNotConvertAlreadyMigratedTimeAgainWhenTheOldPackageLaterExpires() {
        var source=database();
        try {
            var db=new JdbcTemplate(source);flyway(source,"47").migrate();
            var fixture=seed(db,false);flyway(source,"48").migrate();
            consume(db,fixture,97);
            db.update("UPDATE gaming_time_packages SET expires_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(86400)),fixture.expiringPackage());
            long before=balance(db,fixture.customer());
            var entries=db.queryForList("SELECT * FROM gaming_time_ledger ORDER BY id");
            flyway(source,null).migrate();
            assertThat(balance(db,fixture.customer())).isEqualTo(before);
            assertThat(db.queryForList("SELECT * FROM gaming_time_ledger ORDER BY id")).isEqualTo(entries);
            assertThat(flyway(source,null).migrate().migrationsExecuted).isZero();
            flyway(source,null).validate();assertLedger(db);
        } finally { source.destroy(); }
    }

    @Test
    void freshInstallAndSecondStartupDoNotDuplicateSchemaObjects() {
        var source=database();
        try {
            var db=new JdbcTemplate(source);
            assertThat(flyway(source,null).migrate().migrationsExecuted).isEqualTo(50);
            assertThat(db.queryForObject("SELECT COUNT(*) FROM gaming_time_accounts",Integer.class)).isZero();
            assertThat(db.queryForObject("SELECT minute_price FROM gaming_business_policy WHERE id=1",BigDecimal.class)).isNull();
            assertThat(flyway(source,null).migrate().migrationsExecuted).isZero();
            flyway(source,null).validate();
        } finally { source.destroy(); }
    }

    private Flyway flyway(SingleConnectionDataSource source,String target) {
        var config=Flyway.configure().dataSource(source);
        new H2MigrationConfiguration().h2MigrationSyntax().customize(config);
        if(target!=null)config.target(target);
        return config.load();
    }
    private record Fixture(String customer,String owner,String pc,String location,String expiringPackage) {}
    private Fixture seed(JdbcTemplate db,boolean expired) {
        String customer=id(),owner=id(),service=id(),location=id(),area=id(),pc=id(),tariff=id(),pack=id(),expiring=id(),operation=id();
        for(var row:List.of(new String[]{owner,"OWNER"},new String[]{customer,"CUSTOMER"}))
            db.update("INSERT INTO users(id,name,email,password_hash,role,active,created_at,updated_at,version) VALUES(?,?,?,'unused',?,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0)",row[0],row[1],row[0]+"@upgrade.test",row[1]);
        db.update("INSERT INTO catalog_items(id,name,type,price,duration_minutes,active,created_at,updated_at,version) VALUES(?,'Gaming','SERVICE',1,60,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0)",service);
        db.update("INSERT INTO locations(id,code,name,address,timezone,created_at,updated_at) VALUES(?,'UP','Upgrade','Test','Europe/Belgrade',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",location);
        db.update("INSERT INTO areas(id,location_id,code,name,created_at,updated_at) VALUES(?,?,'A','Area',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",area,location);
        db.update("INSERT INTO physical_resources(id,area_id,service_id,code,name,resource_type,created_at,updated_at) VALUES(?,?,?,'PC','PC','GAMING_PC',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",pc,area,service);
        db.update("INSERT INTO gaming_tariffs(id,name,minutes,price,currency,active,package_validity_days,version) VALUES(?,'Historical',60,777,'RSD',TRUE,0,0)",tariff);
        db.update("INSERT INTO gaming_financial_operations(id,customer_id,resource_id,location_id,actor_id,kind,method,amount,currency,status,created_at) VALUES(?,?,?,?,?,'CREDIT_TOPUP','CASH',500,'RSD','RECORDED',CURRENT_TIMESTAMP)",operation,customer,pc,location,owner);
        db.update("INSERT INTO gaming_wallet_ledger(id,customer_id,operation_id,amount,minutes,currency,kind,actor_id,created_at) VALUES(?,?,?,500,0,'RSD','TOPUP',?,CURRENT_TIMESTAMP)",id(),customer,operation,owner);
        db.update("INSERT INTO gaming_time_packages(id,customer_id,tariff_id,minutes,price,snapshot,created_at) VALUES(?,?,?,120,777,'historical snapshot',CURRENT_TIMESTAMP)",pack,customer,tariff);
        db.update("INSERT INTO gaming_wallet_ledger(id,customer_id,package_id,amount,minutes,currency,kind,actor_id,created_at) VALUES(?,?,?,0,75,'RSD','PACKAGE_PURCHASE',?,CURRENT_TIMESTAMP)",id(),customer,pack,owner);
        db.update("INSERT INTO gaming_time_packages(id,customer_id,tariff_id,minutes,price,expires_at,snapshot,created_at) VALUES(?,?,?,25,100,?,'expiring snapshot',CURRENT_TIMESTAMP)",expiring,customer,tariff,Timestamp.from(Instant.now().plusSeconds(expired?-86400:86400)));
        db.update("INSERT INTO gaming_wallet_ledger(id,customer_id,package_id,amount,minutes,currency,kind,actor_id,created_at) VALUES(?,?,?,0,25,'RSD','PACKAGE_PURCHASE',?,CURRENT_TIMESTAMP)",id(),customer,expiring,owner);
        db.update("INSERT INTO gaming_sessions(id,customer_id,resource_id,location_id,started_by,started_at,ends_at,status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0)",id(),customer,pc,location,owner,Timestamp.from(Instant.now().minusSeconds(60)),Timestamp.from(Instant.now().plusSeconds(120)));
        return new Fixture(customer,owner,pc,location,expiring);
    }
    private void consume(JdbcTemplate db,Fixture f,int seconds) {
        db.update("UPDATE gaming_time_accounts SET balance_seconds=balance_seconds-? WHERE customer_id=?",seconds,f.customer());
        db.update("INSERT INTO gaming_time_ledger(id,customer_id,actor_id,delta_seconds,balance_after,kind,source_key,created_at) VALUES(?,?,?, ?,?,'CONSUMPTION',?,CURRENT_TIMESTAMP)",id(),f.customer(),f.owner(),-seconds,balance(db,f.customer()),"usage:"+id());
    }
    private void buyModernTime(JdbcTemplate db,Fixture f,int seconds) {
        String operation=id();
        db.update("INSERT INTO gaming_financial_operations(id,customer_id,actor_id,kind,method,amount,currency,status,granted_seconds,minute_price,price_version,created_at) VALUES(?,?,?,'TIME_GRANT','CASH',75,'RSD','RECORDED',?,2.50,1,CURRENT_TIMESTAMP)",operation,f.customer(),f.owner(),seconds);
        db.update("UPDATE gaming_time_accounts SET balance_seconds=balance_seconds+? WHERE customer_id=?",seconds,f.customer());
        db.update("INSERT INTO gaming_time_ledger(id,customer_id,actor_id,operation_id,delta_seconds,balance_after,kind,source_key,created_at) VALUES(?,?,?,?,?,?,'GRANT',?,CURRENT_TIMESTAMP)",id(),f.customer(),f.owner(),operation,seconds,balance(db,f.customer()),"payment:"+id());
    }
    private static long balance(JdbcTemplate db,String customer) { return db.queryForObject("SELECT balance_seconds FROM gaming_time_accounts WHERE customer_id=?",Long.class,customer); }
    private static String id() { return UUID.randomUUID().toString(); }
    private static void assertLedger(JdbcTemplate db) {
        assertThat(db.queryForObject("SELECT COUNT(*) FROM gaming_time_accounts a WHERE a.balance_seconds<0 OR a.balance_seconds<>(SELECT COALESCE(SUM(l.delta_seconds),0) FROM gaming_time_ledger l WHERE l.customer_id=a.customer_id)",Integer.class)).isZero();
    }
}
