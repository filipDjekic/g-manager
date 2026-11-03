package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.Testcontainers;
import org.testcontainers.containers.*;
import org.testcontainers.images.builder.*;
import org.testcontainers.junit.jupiter.Container;

/** Actual scripts, native MySQL, document archive and restic read-back. The remote S3 transport remains an infrastructure acceptance step. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="BACKUP_COORDINATION_KEY=isolated-backup-coordination-key-32-bytes")
@AutoConfigureMockMvc @ActiveProfiles("test") @org.testcontainers.junit.jupiter.Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class ProductionBackupIT {
    static final Network NETWORK=Network.newNetwork();
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gmanager").withUsername("pilot").withPassword("disposable-backup-password")
            .withEnv("MYSQL_ROOT_HOST","%").withEnv("TZ","UTC").withUrlParam("serverTimezone","UTC").withNetwork(NETWORK).withNetworkAliases("mysql");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
        registry.add("spring.datasource.url",MYSQL::getJdbcUrl);registry.add("spring.datasource.username",MYSQL::getUsername);
        registry.add("spring.datasource.password",MYSQL::getPassword);registry.add("spring.datasource.driver-class-name",MYSQL::getDriverClassName);
        registry.add("app.gaming-client.policy-signing-private-key",()->Base64.getEncoder().encodeToString(PilotGamingCenterIT.SIGNING.getPrivate().getEncoded()));
        registry.add("app.gaming-client.policy-signing-key-id",()->"pilot-ephemeral");
    }
    @LocalServerPort int port;@Autowired ApplicationContext context;@Autowired MockMvc mvc;
    @AfterAll static void closeNetwork(){MYSQL.stop();NETWORK.close();}
    @Test void scheduledSetIsUploadedRestoredAndAnOffsiteFailureCannotClaimSuccessOrExtendASession() throws Exception {
        assertThat(MYSQL.execInContainer("mkdir","-p","/run/secrets").getExitCode()).isZero();
        MYSQL.copyFileToContainer(org.testcontainers.utility.MountableFile.forHostPath(Path.of("..","ops","deploy","mysql-init.sh").toAbsolutePath()),"/tmp/production-users.sh");
        MYSQL.copyFileToContainer(Transferable.of(MYSQL.getPassword(),0444),"/run/secrets/db_root_password");
        MYSQL.copyFileToContainer(Transferable.of("pilot",0444),"/run/secrets/db_username");
        MYSQL.copyFileToContainer(Transferable.of("migration-test-with-'quote-and-\\-slash",0444),"/run/secrets/migration_db_password");
        MYSQL.copyFileToContainer(Transferable.of("disposable-isolated-restore-password",0444),"/run/secrets/restore_verifier_password");
        MYSQL.copyFileToContainer(Transferable.of("disposable-backup-read-password",0444),"/run/secrets/backup_db_password");
        var provision=MYSQL.execInContainer("bash","/tmp/production-users.sh");assertThat(provision.getExitCode()).withFailMessage(provision.getStderr()).isZero();
        // MySQL caches database grants on existing connections; production starts these users after init.
        context.getBean(com.zaxxer.hikari.HikariDataSource.class).getHikariPoolMXBean().softEvictConnections();
        var f=new PilotGamingCenterIT();f.mvc=mvc;f.jdbc=context.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        f.jwt=context.getBean(com.game_manager.gm.security.JwtService.class);f.passwords=context.getBean(org.springframework.security.crypto.password.PasswordEncoder.class);
        f.json=context.getBean(tools.jackson.databind.ObjectMapper.class);f.fixture();
        assertThatThrownBy(()->f.jdbc.execute("CREATE TABLE forbidden_runtime_ddl (id INT)")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        var started=f.command("/api/v1/gaming-sessions",f.staff(2),f.start(0,0,0,"CASH",200),201);
        context.getBean(com.game_manager.gm.document.DocumentService.class).storeGenerated(PilotGamingCenterIT.id("owner"),"backup.txt","text/plain","private restore fixture".getBytes(StandardCharsets.UTF_8));
        Testcontainers.exposeHostPorts(port);
        var image=new ImageFromDockerfile();
        for(String file:List.of("Dockerfile","backup.sh","restore-drill.sh","backup-loop.sh","backup-set.sh","scheduled-backup.sh","ledger-check.sql"))image.withFileFromPath(file,Path.of("..","ops","backup",file).toAbsolutePath());
        try(var backup=new GenericContainer<>(image).withNetwork(NETWORK).withAccessToHost(true).withCommand("sleep","infinity")
                .withCreateContainerCmdModifier(command->command.getHostConfig().withPublishAllPorts(false))
                .withEnv("DB_HOST","mysql").withEnv("DB_NAME","gmanager").withEnv("DB_USER","gmanager_backup")
                .withEnv("DB_PASSWORD_FILE","/tmp/db-password").withEnv("RESTORE_PASSWORD_FILE","/tmp/restore-password")
                .withEnv("RESTORE_ADMIN_USER","gmanager_restore_verifier").withEnv("RESTORE_SKIP_GRANT","true")
                .withEnv("BACKUP_KEY_FILE","/tmp/key").withEnv("BACKUP_OUTPUT_DIR","/tmp/output")
                .withEnv("BACKUP_COORDINATION_KEY_FILE","/tmp/coordination").withEnv("BACKUP_COORDINATION_URL","http://host.testcontainers.internal:"+port+"/internal/backup")
                .withEnv("RESTIC_REPOSITORY","/tmp/offsite").withEnv("RESTIC_PASSWORD_FILE","/tmp/key")
                .withEnv("BACKUP_RESTORE_INTERVAL","1").withEnv("RESTORE_DB_USER","pilot")){
            backup.start();backup.copyFileToContainer(Transferable.of("disposable-backup-read-password",0444),"/tmp/db-password");
            var writeDenied=backup.execInContainer("env","MYSQL_PWD=disposable-backup-read-password","mysql","-hmysql","-ugmanager_backup","gmanager","-e","UPDATE users SET name=name WHERE 1=0");
            assertThat(writeDenied.getExitCode()).as("The backup credential cannot modify active business rows").isNotZero();
            backup.copyFileToContainer(Transferable.of("disposable-backup-key-at-least-32-bytes",0444),"/tmp/key");
            backup.copyFileToContainer(Transferable.of("disposable-isolated-restore-password",0444),"/tmp/restore-password");
            var denied=backup.execInContainer("env","MYSQL_PWD=disposable-isolated-restore-password","mysql","-hmysql","-ugmanager_restore_verifier","gmanager","-e","SELECT COUNT(*) FROM users");
            assertThat(denied.getExitCode()).as("The restore verifier cannot read the active business schema").isNotZero();
            backup.copyFileToContainer(Transferable.of(ProductionOperationsIntegrationTest.KEY,0444),"/tmp/coordination");
            assertThat(backup.execInContainer("restic","init").getExitCode()).isZero();
            var result=backup.execInContainer("/backup/scheduled-backup.sh");
            assertThat(result.getExitCode()).withFailMessage(result.getStderr()+result.getStdout()).isZero();
            var state=f.json.readTree(backup.execInContainer("cat","/tmp/output/status.json").getStdout());
            assertThat(state.get("status").asText()).isEqualTo("SUCCESS");assertThat(state.get("lastRestoreSuccessAt").asLong()).isPositive();
            var recovery=f.json.readTree(backup.execInContainer("bash","-c","cat /tmp/output/sets/set-*/release.json").getStdout());
            assertThat(recovery.get("formatVersion").asText()).isEqualTo("1");assertThat(recovery.hasNonNull("backendImage")).isTrue();assertThat(recovery.has("dbPassword")).isFalse();
            var verified=MYSQL.execInContainer("env","MYSQL_PWD="+MYSQL.getPassword(),"mysql","-uroot","-N","-e","SELECT COUNT(*) FROM gmanager_restore_drill_scheduled.gaming_financial_operations; SELECT COUNT(*) FROM gmanager_restore_drill_scheduled.document_versions;");
            assertThat(verified.getExitCode()).withFailMessage(verified.getStderr()).isZero();assertThat(verified.getStdout().trim().lines().toList()).containsExactly("1","1");
            var failed=backup.execInContainer("env","RESTIC_REPOSITORY=/tmp/nonexistent-offsite","/backup/scheduled-backup.sh");
            assertThat(failed.getExitCode()).isNotZero();
            var after=f.json.readTree(backup.execInContainer("cat","/tmp/output/status.json").getStdout());
            assertThat(after.get("status").asText()).isEqualTo("FAILED");assertThat(after.get("lastSuccessAt")).isEqualTo(state.get("lastSuccessAt"));
            var lease=f.lease(0);assertThat(lease.get("directive").asText()).isEqualTo("ACTIVE");
            assertThat(java.time.Instant.parse(lease.get("sessionEndsAt").asText())).isCloseTo(java.time.Instant.parse(started.get("endsAt").asText()),within(1,java.time.temporal.ChronoUnit.MILLIS));
            f.assertLedger();
        }
    }
}
