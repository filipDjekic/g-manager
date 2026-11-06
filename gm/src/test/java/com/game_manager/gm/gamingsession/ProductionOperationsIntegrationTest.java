package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;

/** Reuses the disposable five-station fixture; no Windows enforcement or production credentials. */
@SpringBootTest(properties={"app.gaming-client.status=RELEASED","app.gaming-client.version=4.0.0",
        "app.gaming-client.download-url=https://updates.example.test/4.0.0/GManager.Client.zip",
        "app.gaming-client.sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "app.gaming-client.package-signing-subject=CN=Isolated Test Fixture",
        "BACKUP_COORDINATION_KEY=isolated-backup-coordination-key-32-bytes"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class ProductionOperationsIntegrationTest {
    static final String KEY="isolated-backup-coordination-key-32-bytes";
    @DynamicPropertySource static void signing(DynamicPropertyRegistry registry){
        registry.add("app.gaming-client.policy-signing-private-key",()->Base64.getEncoder().encodeToString(PilotGamingCenterIT.SIGNING.getPrivate().getEncoded()));
        registry.add("app.gaming-client.policy-signing-key-id",()->"pilot-ephemeral");
    }
    @Autowired ApplicationContext context;@Autowired MockMvc mvc;
    PilotGamingCenterIT f;
    @BeforeEach void fixture() throws Exception {
        f=new PilotGamingCenterIT();f.mvc=mvc;f.jdbc=context.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        f.jwt=context.getBean(com.game_manager.gm.security.JwtService.class);f.passwords=context.getBean(org.springframework.security.crypto.password.PasswordEncoder.class);
        f.json=context.getBean(tools.jackson.databind.ObjectMapper.class);f.fixture();
    }
    String path(int pc){return "/api/v1/stations/"+PilotGamingCenterIT.id("pc-"+pc)+"/client-updates";}
    @Test void managedUpdateIsScopedAuditedSignedAndNeverChangesPaidTime() throws Exception {
        var started=f.startVisit(0,0,200,60);
        var requested=f.call(post(path(0)),f.staff(0),Map.of("reason","One-station canary","notBefore",Instant.now().plusSeconds(60)),200);
        assertThat(requested.get("targetVersion").asText()).isEqualTo("4.0.0");
        var replay=f.call(post(path(0)),f.staff(1),Map.of("reason","Same pending target"),200);
        assertThat(replay.get("id").asText()).isEqualTo(requested.get("id").asText());
        var lease=f.lease(0);assertThat(lease.get("clientUpdate").get("id").asText()).isEqualTo(requested.get("id").asText());
        assertThat(Instant.parse(lease.get("sessionEndsAt").asText())).isCloseTo(Instant.parse(started.get("endsAt").asText()),within(1,java.time.temporal.ChronoUnit.MILLIS));
        f.call(post(path(0)),f.staff(2),Map.of("reason","Unauthorized update"),403);
        f.call(get(path(0)),f.customer(0),null,403);
        var updates=context.getBean(com.game_manager.gm.common.scheduling.ClientUpdatePort.class);
        updates.observe(PilotGamingCenterIT.id("pc-0"),"3.0.0","FAILED",UUID.randomUUID());
        assertThat(f.call(get(path(0)),f.staff(0),null,200).get("content").get(0).get("status").asText()).isEqualTo("REQUESTED");
        updates.observe(PilotGamingCenterIT.id("pc-0"),"3.0.0","DEFERRED",UUID.fromString(requested.get("id").asText()));
        assertThat(f.call(get(path(0)),f.staff(0),null,200).get("content").get(0).get("status").asText()).isEqualTo("DEFERRED");
        updates.observe(PilotGamingCenterIT.id("pc-0"),"4.0.0","CURRENT",UUID.fromString(requested.get("id").asText()));
        assertThat(f.call(get(path(0)),f.staff(0),null,200).get("content").get(0).get("status").asText()).isEqualTo("APPLIED");
        assertThat(f.lease(0).hasNonNull("clientUpdate")).isFalse();f.assertLedger();
        assertThat(f.jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action='CLIENT_UPDATE_REQUESTED'",Integer.class)).isEqualTo(1);
    }
    @Test void backupGateRejectsBadTokensAndFinancialRetryCommitsExactlyOnceWhileMachineLeaseWorks() throws Exception {
        f.call(post("/internal/backup"),null,null,401);
        var lease=f.call(post("/internal/backup").header("X-GManager-Backup-Key",KEY),null,null,200);
        String key="backup-retry-topup",path="/api/v1/gaming-billing/customers/"+PilotGamingCenterIT.id("customer-0")+"/time-grants";
        var body=Map.of("minutes",60,"priceVersion",1);
        try{
            f.call(get("/internal/backup/"+lease.get("id").asText()+"/metadata"),null,null,401);
            var metadata=f.call(get("/internal/backup/"+lease.get("id").asText()+"/metadata").header("X-GManager-Backup-Key",KEY),null,null,200);
            assertThat(metadata.get("formatVersion").asText()).isEqualTo("1");assertThat(metadata.has("privateKey")).isFalse();assertThat(metadata.has("dbPassword")).isFalse();
            f.call(post(path).header("Idempotency-Key",key),f.staff(2),body,503);
            assertThat(f.jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isZero();
            assertThat(f.lease(0).get("directive").asText()).isEqualTo("LOCK");
        }finally{f.call(delete("/internal/backup/"+lease.get("id").asText()).header("X-GManager-Backup-Key",KEY),null,null,200);}
        JsonNode result=f.call(post(path).header("Idempotency-Key",key),f.staff(2),body,200);
        assertThat(f.call(post(path).header("Idempotency-Key",key),f.staff(2),body,200)).isEqualTo(result);
        assertThat(f.jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(1);f.assertLedger();
    }
    @Test void referencedDocumentsAreExportedWithVerifiedContentAndWritesRemainBlocked() throws Exception {
        var documents=context.getBean(com.game_manager.gm.document.DocumentService.class);
        byte[] content="private isolated backup fixture".getBytes(StandardCharsets.UTF_8);
        documents.storeGenerated(PilotGamingCenterIT.id("owner"),"test.txt","text/plain",content);
        var lease=f.call(post("/internal/backup").header("X-GManager-Backup-Key",KEY),null,null,200);
        try{
            assertThatThrownBy(()->documents.storeGenerated(PilotGamingCenterIT.id("owner"),"blocked.txt","text/plain",content)).isInstanceOf(com.game_manager.gm.common.error.ApplicationException.class);
            var response=mvc.perform(get("/internal/backup/"+lease.get("id").asText()+"/documents").header("X-GManager-Backup-Key",KEY)).andReturn().getResponse();
            assertThat(response.getStatus()).isEqualTo(200);
            try(var zip=new ZipInputStream(new java.io.ByteArrayInputStream(response.getContentAsByteArray()))){assertThat(zip.getNextEntry().getName()).startsWith("objects/generated/");assertThat(zip.readAllBytes()).isEqualTo(content);assertThat(zip.getNextEntry()).isNull();}
        }finally{f.call(delete("/internal/backup/"+lease.get("id").asText()).header("X-GManager-Backup-Key",KEY),null,null,200);}
    }
    @Test void stationDiagnosticsRespectEmployeeResourceAssignments() throws Exception {
        f.insert("users","id,name,email,password_hash,role,active",PilotGamingCenterIT.id("unassigned"),"Unassigned","unassigned@pilot.example.test","unused","EMPLOYEE",true);
        f.call(get("/api/v1/stations/"+PilotGamingCenterIT.id("pc-0")+"/client-status"),f.jwt.issue(PilotGamingCenterIT.id("unassigned")).value(),null,403);
        f.call(get("/api/v1/stations/"+PilotGamingCenterIT.id("pc-0")+"/client-status"),f.staff(2),null,200);
    }
    @Test void updateClaimCannotInterruptPaidTimeAndBlocksTheNextCustomerUntilCompletion() throws Exception {
        var started=f.startVisit(0,0,200,60);
        var requested=f.call(post(path(0)),f.staff(0),Map.of("reason","Managed update after visit"),200);
        var claim=Map.of("requestId",requested.get("id").asText());
        f.call(post("/api/v1/machine/client-update/claim"),f.machines.get(0),claim,409);
        f.pollAndAck(0,false);
        f.command("/api/v1/gaming-sessions/"+started.get("id").asText()+"/terminate",f.staff(2),Map.of("version",started.get("version").asLong(),"reason","Visit complete"),200);
        f.pollAndAck(0,true);
        f.command("/api/v1/gaming-operations/stations/"+PilotGamingCenterIT.id("pc-0")+"/prepare",f.staff(2),Map.of("sessionId",started.get("id").asText(),"isolatedProfileVerified",true,"reason","Synthetic privacy fixture"),200);
        f.call(post("/api/v1/machine/client-update/claim"),f.machines.get(0),claim,204);
        f.command("/api/v1/gaming-billing/customers/"+PilotGamingCenterIT.id("customer-1")+"/time-grants",f.staff(2),Map.of("minutes",60,"priceVersion",1),200);
        f.command("/api/v1/gaming-billing/assignments",f.staff(2),Map.of("customerId",PilotGamingCenterIT.id("customer-1"),"resourceId",PilotGamingCenterIT.id("pc-0")),409);
        assertThat(f.jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(2);
        assertThat(f.call(get(path(0)),f.staff(0),null,200).get("content").get(0).get("status").asText()).isEqualTo("INSTALLING");
        context.getBean(com.game_manager.gm.common.scheduling.ClientUpdatePort.class).observe(PilotGamingCenterIT.id("pc-0"),"4.0.0","CURRENT",UUID.fromString(requested.get("id").asText()));
        f.command("/api/v1/gaming-billing/assignments",f.staff(2),Map.of("customerId",PilotGamingCenterIT.id("customer-1"),"resourceId",PilotGamingCenterIT.id("pc-0")),200);f.assertLedger();
    }
    @Test void simultaneousAssignmentAndUpdateClaimHaveExactlyOneWinner() throws Exception {
        f.command("/api/v1/gaming-billing/customers/"+PilotGamingCenterIT.id("customer-0")+"/time-grants",f.staff(2),Map.of("minutes",60,"priceVersion",1),200);
        var requested=f.call(post(path(0)),f.staff(0),Map.of("reason","Concurrent claim test"),200);
        var outcomes=f.parallel(List.of(
            ()->f.rawCommand("/api/v1/gaming-billing/assignments",f.staff(2),Map.of("customerId",PilotGamingCenterIT.id("customer-0"),"resourceId",PilotGamingCenterIT.id("pc-0"))),
            ()->f.rawCommand("/api/v1/machine/client-update/claim",f.machines.get(0),Map.of("requestId",requested.get("id").asText()))));
        var codes=outcomes.stream().map(value->value.get("status").asInt()).toList();
        assertThat(codes).contains(409);assertThat(codes.stream().filter(value->value==200||value==204).count()).isEqualTo(1);f.assertLedger();
    }
}
