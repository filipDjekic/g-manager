package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.game_manager.gm.security.JwtService;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import tools.jackson.databind.*;

/** Disposable InnoDB pilot. Synthetic protocol ACKs are NOT evidence of physical Windows enforcement. */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class PilotGamingCenterIT {
    static final KeyPair SIGNING=keyPair();
    static final int MYSQL_PORT=freePort();
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gaming_pilot_it").withUsername("pilot").withPassword("disposable-pilot-password")
            .withEnv("TZ","UTC").withUrlParam("serverTimezone","UTC")
            .withCreateContainerCmdModifier(c->c.getHostConfig().withPortBindings(new com.github.dockerjava.api.model.PortBinding(
                    com.github.dockerjava.api.model.Ports.Binding.bindIpAndPort("127.0.0.1",MYSQL_PORT),new com.github.dockerjava.api.model.ExposedPort(3306))));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",MYSQL::getJdbcUrl);r.add("spring.datasource.username",MYSQL::getUsername);
        r.add("spring.datasource.password",MYSQL::getPassword);r.add("spring.datasource.driver-class-name",MYSQL::getDriverClassName);
        r.add("app.gaming-client.policy-signing-private-key",()->Base64.getEncoder().encodeToString(SIGNING.getPrivate().getEncoded()));
        r.add("app.gaming-client.policy-signing-key-id",()->"pilot-ephemeral");
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired JwtService jwt;
    @Autowired PasswordEncoder passwords; @Autowired ObjectMapper json;
    final List<String> machines=new ArrayList<>(); final long[] cursors=new long[20];
    static UUID id(String key){return UUID.nameUUIDFromBytes(("gmanager-pilot:"+key).getBytes(StandardCharsets.UTF_8));}
    String staff(int number){return jwt.issue(id(number==0?"owner":number==1?"admin":"employee-"+(number-2))).value();}
    String customer(int number){return jwt.issue(id("customer-"+number)).value();}

    @BeforeEach void fixture() throws Exception {
        testsupport.DatabaseCleaner.clean(jdbc);jdbc.update("DELETE FROM catalog_items WHERE id=?",id("service").toString());machines.clear();Arrays.fill(cursors,0);
        String hash=passwords.encode("PilotPass1!");
        for(int i=0;i<14;i++) {
            String key=i==0?"owner":i==1?"admin":i<4?"employee-"+(i-2):"customer-"+(i-4);
            insert("users","id,name,email,password_hash,role,active",id(key),key,key+"@pilot.example.test",hash,i==0?"OWNER":i==1?"ADMIN":i<4?"EMPLOYEE":"CUSTOMER",true);
        }
        insert("catalog_items","id,name,type,price,duration_minutes,active",id("service"),"Pilot PC","SERVICE",100,30,true);
        insert("locations","id,code,name,address,timezone,active",id("location"),"PILOT","Pilot","Isolated fixture","Europe/Belgrade",true);
        insert("areas","id,location_id,code,name,active",id("area"),id("location"),"PILOT","Pilot",true);
        insert("application_profiles","id,code,name,active,configuration_version",id("profile"),"PILOT","Pilot signed empty profile",true,1);
        jdbc.update("UPDATE working_hours SET active=TRUE,open_time='00:00:00',close_time='23:59:59'");
        for(int i=0;i<3;i++) jdbc.update("INSERT INTO gaming_tariffs (id,name,minutes,price,currency,active,package_validity_days,version) VALUES (?,?,?,?,'RSD',TRUE,7,0)",
                id("tariff-"+i).toString(),"Pilot tariff "+i,i==2?90:30,i==2?300:i==1?150:100);
        addStations(0,5);
    }
    void insert(String table,String columns,Object... values) {
        var args=new ArrayList<Object>();for(Object v:values)args.add(v instanceof UUID?v.toString():v);
        args.add(Timestamp.from(Instant.now()));args.add(Timestamp.from(Instant.now()));args.add(0);
        jdbc.update("INSERT INTO "+table+" ("+columns+",created_at,updated_at,version) VALUES ("+String.join(",",Collections.nCopies(args.size(),"?"))+")",args.toArray());
    }
    void addStations(int from,int until) throws Exception {
        for(int i=from;i<until;i++) {
            insert("physical_resources","id,area_id,service_id,code,name,resource_type,active,bookable",id("pc-"+i),id("area"),id("service"),"PC-"+i,"Pilot PC "+i,"GAMING_PC",true,true);
            insert("gaming_station_profiles","id,resource_id,application_profile_id,client_enabled,operational_status",id("station-"+i),id("pc-"+i),id("profile"),true,"AVAILABLE");
            for(int e=0;e<2;e++)insert("user_resource_assignments","id,user_id,resource_id,active",id("assignment-"+e+"-"+i),id("employee-"+e),id("pc-"+i),true);
            var enrollment=call(post("/api/v1/stations/"+id("pc-"+i)+"/machine-identity/enrollment-token"),staff(0),null,201);
            KeyPair key=keyPair();var identity=call(post("/api/v1/machine/enroll"),null,Map.of("enrollmentToken",enrollment.get("enrollmentToken").asText(),"publicKeyBase64",Base64.getEncoder().encodeToString(key.getPublic().getEncoded()),"clientVersion","pilot-protocol-test"),201);
            String identityId=identity.get("identityId").asText();var challenge=call(post("/api/v1/machine/auth/challenge"),null,Map.of("identityId",identityId),200);
            Signature signer=Signature.getInstance("Ed25519");signer.initSign(key.getPrivate());signer.update((challenge.get("challengeId").asText()+":"+identityId+":"+challenge.get("nonce").asText()).getBytes(StandardCharsets.UTF_8));
            var auth=call(post("/api/v1/machine/auth/token"),null,Map.of("identityId",identityId,"challengeId",challenge.get("challengeId").asText(),"nonce",challenge.get("nonce").asText(),"signature",Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign())),200);
            machines.add(auth.get("token").asText());heartbeat(i,null);
        }
    }
    JsonNode call(MockHttpServletRequestBuilder r,String token,Object body,int expected) throws Exception {
        var response=mvc.perform(request(r,token,body)).andExpect(status().is(expected)).andReturn().getResponse();
        return json.readTree(response.getContentAsByteArray().length==0?"{}":response.getContentAsString());
    }
    MockHttpServletRequestBuilder request(MockHttpServletRequestBuilder r,String token,Object body) {
        if(token!=null)r.header("Authorization","Bearer "+token);
        if(body!=null)r.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));return r;
    }
    JsonNode command(String path,String token,Object body,int status) throws Exception {return call(post(path).header("Idempotency-Key",UUID.randomUUID()),token,body,status);}
    Map<String,Object> payment(String method,int amount){return Map.of("method",method,"amount",amount);}
    Map<String,Object> purchase(int tariff,String method,int amount){return Map.of("tariffId",id("tariff-"+tariff),"tariffVersion",0,"payment",payment(method,amount));}
    Map<String,Object> start(int pc,Integer customer,int tariff,String method,int amount){var b=new HashMap<String,Object>();b.put("resourceId",id("pc-"+pc));b.put("durationMinutes",60);b.put(customer==null?"guestName":"customerId",customer==null?"Pilot guest "+pc:id("customer-"+customer));b.put("purchase",purchase(tariff,method,amount));return b;}
    void heartbeat(int pc,String error) throws Exception {var body=new HashMap<String,Object>();body.put("clientVersion","pilot-protocol-test");body.put("status","LOCKED");body.put("lastCommandSequence",cursors[pc]);body.put("enforcementStatus","LOCKED");if(error!=null)body.put("errorCode",error);call(post("/api/v1/machine/heartbeat"),machines.get(pc),body,204);}
    JsonNode lease(int pc) throws Exception {
        var envelope=call(get("/api/v1/machine/lease"),machines.get(pc),null,200);byte[] payload=Base64.getUrlDecoder().decode(envelope.get("payload").asText());
        Signature verifier=Signature.getInstance("Ed25519");verifier.initVerify(SIGNING.getPublic());verifier.update(payload);
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(envelope.get("signature").asText()))).isTrue();
        var decoded=json.readTree(payload);assertThat(decoded.get("stationId").asText()).isEqualTo(id("pc-"+pc).toString());return decoded;
    }
    void pollAndAck(int pc,boolean lock) throws Exception {
        var signed=lease(pc);var commands=call(get("/api/v1/machine/commands").param("afterSequence",Long.toString(cursors[pc])),machines.get(pc),null,200);
        for(var c:commands) {
            long sequence=c.get("sequence").asLong();assertThat(sequence).isEqualTo(cursors[pc]+1).isLessThanOrEqualTo(signed.get("commandCursor").asLong());
            var p=json.readTree(c.get("payload").asText());assertThat(p.get("stationId").asText()).isEqualTo(id("pc-"+pc).toString());
            call(post("/api/v1/machine/commands/"+sequence+"/ack"),machines.get(pc),Map.of(),200);
            if(lock)call(post("/api/v1/machine/enforcement/lock-ack"),machines.get(pc),Map.of("sessionId",p.get("sessionId").asText(),"commandSequence",sequence,"reason","Synthetic pilot protocol ACK; physical state unverified"),200);
            cursors[pc]=sequence;
        }
        heartbeat(pc,null);
    }
    List<JsonNode> parallel(List<Callable<JsonNode>> work) throws Exception {
        var ready=new CountDownLatch(work.size());var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(work.size())) {
            var futures=new ArrayList<Future<JsonNode>>();for(var job:work)futures.add(pool.submit(()->{ready.countDown();if(!go.await(20,TimeUnit.SECONDS))throw new TimeoutException();return job.call();}));
            assertThat(ready.await(20,TimeUnit.SECONDS)).isTrue();go.countDown();var result=new ArrayList<JsonNode>();for(var f:futures)result.add(f.get(60,TimeUnit.SECONDS));return result;
        } finally {go.countDown();}
    }

    @Test void fourParallelWavesServeTenCustomersAndTenGuestsWithPaymentsPackagesAndPrivacy() throws Exception {
        var wallet=command("/api/v1/gaming-billing/customers/"+id("customer-0")+"/topups",staff(2),Map.of("resourceId",id("pc-0"),"payment",payment("CASH",500),"reason","Pilot prepaid deposit"),200);
        assertThat(wallet.get("balance").decimalValue()).isEqualByComparingTo("500");
        wallet=command("/api/v1/gaming-billing/customers/"+id("customer-1")+"/packages",staff(3),Map.of("resourceId",id("pc-1"),"tariffId",id("tariff-2"),"tariffVersion",0,"payment",payment("CASH",300)),200);
        String pack=wallet.get("packages").get(0).get("id").asText();
        var packaged=Map.of("tariffId",id("tariff-2"),"tariffVersion",0,"packageId",pack,"payment",payment("TIME_PACKAGE",0));
        for(int wave=0;wave<4;wave++) {
            List<Callable<JsonNode>> starts=new ArrayList<>();
            for(int pc=0;pc<5;pc++) {
                final int n=pc,w=wave;int tariff=pc==4?1:0;
                var body=start(pc,wave<2?wave*5+pc:null,tariff,wave==0&&pc==0?"WALLET":"CASH",tariff==1?300:200);
                if(wave==0&&pc==1)body.put("purchase",packaged);
                starts.add(()->command("/api/v1/gaming-sessions",staff(2+n%2),body,201));
            }
            var started=parallel(starts);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_sessions WHERE status='ACTIVE'",Integer.class)).isEqualTo(5);
            for(int pc=0;pc<5;pc++) {
                String session=started.get(pc).get("id").asText();pollAndAck(pc,false);assertThat(lease(pc).get("directive").asText()).isEqualTo("ACTIVE");
                call(post(wave<2?"/api/v1/machine/session-login":"/api/v1/machine/guest-login"),machines.get(pc),wave<2?Map.of("email","customer-"+(wave*5+pc)+"@pilot.example.test","password","PilotPass1!"):Map.of("sessionId",session),200);
                Object buy=wave==0&&pc==1?packaged:purchase(pc==4?1:0,wave==0&&pc==0?"WALLET":"CASH",pc==4?150:100);
                var extended=command("/api/v1/gaming-sessions/"+session+"/extend",staff(2+pc%2),Map.of("minutes",30,"version",started.get(pc).get("version").asLong(),"purchase",buy),200);
                pollAndAck(pc,false);
                command("/api/v1/gaming-sessions/"+session+"/terminate",staff(2+pc%2),Map.of("version",extended.get("version").asLong(),"reason","Pilot visit complete"),200);
                assertThat(lease(pc).get("directive").asText()).isEqualTo("LOCK");
                command("/api/v1/gaming-operations/stations/"+id("pc-"+pc)+"/prepare",staff(2),Map.of("sessionId",session,"isolatedProfileVerified",true,"reason","Synthetic readiness fixture"),409);
                pollAndAck(pc,true);
                command("/api/v1/gaming-operations/stations/"+id("pc-"+pc)+"/prepare",staff(2),Map.of("sessionId",session,"isolatedProfileVerified",true,"reason","Synthetic readiness; physical privacy review remains required"),200);
            }
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_sessions",Integer.class)).isEqualTo(20);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_sessions WHERE customer_id IS NULL",Integer.class)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users",Integer.class)).isEqualTo(14);
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM gaming_wallet_ledger WHERE customer_id=?",BigDecimal.class,id("customer-0").toString())).isEqualByComparingTo("200");
        assertThat(jdbc.queryForObject("SELECT SUM(minutes) FROM gaming_wallet_ledger WHERE package_id=?",Integer.class,pack)).isZero();
        assertThat(jdbc.queryForObject("SELECT SUM(recognized_amount) FROM gaming_charges",BigDecimal.class)).isEqualByComparingTo("6600");
        assertThat(call(get("/api/v1/gaming-operations/board"),staff(0),null,200).get("stations")).allSatisfy(s->assertThat(s.get("status").asText()).isEqualTo("AVAILABLE"));
        assertLedger();
        // Execute the actual encrypted backup/restore tools against this container only.
        var image=new org.testcontainers.images.builder.ImageFromDockerfile();
        for(String script:List.of("Dockerfile","backup.sh","restore-drill.sh","backup-loop.sh","backup-set.sh","ledger-check.sql"))
            image.withFileFromPath(script,java.nio.file.Path.of("..","ops","backup",script).toAbsolutePath());
        try(var backup=new org.testcontainers.containers.GenericContainer<>(image)
                .withNetworkMode("container:"+MYSQL.getContainerId()).withCommand("sleep","infinity")
                .withCreateContainerCmdModifier(c->c.getHostConfig().withPublishAllPorts(false))
                .withEnv("DB_HOST","127.0.0.1").withEnv("DB_NAME","gaming_pilot_it").withEnv("DB_USER","pilot")
                .withEnv("DB_PASSWORD_FILE","/tmp/password").withEnv("DB_ROOT_PASSWORD_FILE","/tmp/password")
                .withEnv("BACKUP_KEY_FILE","/tmp/key").withEnv("BACKUP_OUTPUT_DIR","/tmp/output")
                .withEnv("DOCUMENT_BACKUP_ROOT","/tmp/documents").withEnv("BACKUP_WRITES_QUIESCED","true")
                .withEnv("RESTORE_ISOLATED","true").withEnv("RESTORE_DB_USER","pilot")) {
            backup.start();backup.copyFileToContainer(org.testcontainers.images.builder.Transferable.of(MYSQL.getPassword(),0444),"/tmp/password");
            backup.copyFileToContainer(org.testcontainers.images.builder.Transferable.of("disposable-encryption-key-at-least-32-bytes",0444),"/tmp/key");
            var saved=backup.execInContainer("bash","-c","mkdir -p /tmp/documents; printf 'pilot-document' > /tmp/documents/pilot.txt; /backup/backup-set.sh");
            assertThat(saved.getExitCode()).withFailMessage(saved.getStderr()).isZero();
            String manifest=saved.getStdout().trim();String file=manifest.replace(".manifest",".sql.gz.enc");
            var restored=backup.execInContainer("env","BACKUP_FILE="+file,"/backup/restore-drill.sh");
            assertThat(restored.getExitCode()).withFailMessage(restored.getStderr()).isZero();
            var objects=backup.execInContainer("bash","-c","set -euo pipefail; cd /tmp/output; sha256sum -c \"${1%.manifest}.documents.tar.gz.enc.sha256\"; mkdir /tmp/restored-documents; openssl enc -d -aes-256-cbc -pbkdf2 -in \"${1%.manifest}.documents.tar.gz.enc\" -pass file:/tmp/key | tar -xz -C /tmp/restored-documents; test \"$(cat /tmp/restored-documents/pilot.txt)\" = pilot-document","pilot-restore",manifest);
            assertThat(objects.getExitCode()).withFailMessage(objects.getStderr()).isZero();
        }
        for(String table:List.of("gaming_charges","gaming_financial_operations","gaming_wallet_ledger","station_commands"))
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gmanager_restore_drill."+table,Long.class)).isEqualTo(jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Long.class));
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM gmanager_restore_drill.gaming_financial_operations",BigDecimal.class)).isEqualByComparingTo(jdbc.queryForObject("SELECT SUM(amount) FROM gaming_financial_operations",BigDecimal.class));
    }

    @Test void terminationVersusExtensionAndTariffEditCannotCreateAnUnpaidEntitlement() throws Exception {
        var started=command("/api/v1/gaming-sessions",staff(2),start(0,0,0,"CASH",200),201);String session=started.get("id").asText();
        var results=parallel(List.of(
                ()->rawCommand("/api/v1/gaming-sessions/"+session+"/extend",staff(2),Map.of("minutes",30,"version",started.get("version").asLong(),"purchase",purchase(0,"CASH",100))),
                ()->rawCommand("/api/v1/gaming-sessions/"+session+"/terminate",staff(3),Map.of("version",started.get("version").asLong(),"reason","Pilot race"))));
        assertThat(results).extracting(n->n.get("status").asInt()).containsExactlyInAnyOrder(200,409);
        assertLedger();
        var second=command("/api/v1/gaming-sessions",staff(3),start(1,1,0,"CASH",200),201);
        jdbc.update("UPDATE gaming_tariffs SET price=125,version=1 WHERE id=?",id("tariff-0").toString());
        command("/api/v1/gaming-sessions/"+second.get("id").asText()+"/extend",staff(3),Map.of("minutes",30,"version",second.get("version").asLong(),"purchase",purchase(0,"CASH",100)),409);
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM gaming_charges WHERE session_id=?",BigDecimal.class,second.get("id").asText())).isEqualByComparingTo("200");
    }
    JsonNode rawCommand(String path,String token,Object body) throws Exception {var response=mvc.perform(request(post(path).header("Idempotency-Key",UUID.randomUUID()),token,body)).andReturn().getResponse();return json.valueToTree(Map.of("status",response.getStatus()));}

    @Test void transferRequiresSourceLockAndNeverGrantsTwoActiveLeases() throws Exception {
        var started=command("/api/v1/gaming-sessions",staff(2),start(0,null,0,"CASH",200),201);String s=started.get("id").asText();pollAndAck(0,false);
        var moving=command("/api/v1/gaming-sessions/"+s+"/move",staff(3),Map.of("targetResourceId",id("pc-1"),"version",started.get("version").asLong()),200);
        assertThat(lease(0).get("directive").asText()).isEqualTo("LOCK");assertThat(lease(1).get("directive").asText()).isEqualTo("LOCK");
        command("/api/v1/gaming-sessions/"+s+"/complete-move",staff(2),Map.of("version",moving.get("version").asLong()),409);
        pollAndAck(0,true);
        command("/api/v1/gaming-sessions/"+s+"/complete-move",staff(2),Map.of("version",moving.get("version").asLong()),200);
        assertThat(lease(0).get("directive").asText()).isEqualTo("LOCK");assertThat(lease(1).get("directive").asText()).isEqualTo("ACTIVE");
        call(post("/api/v1/machine/guest-login"),machines.get(0),Map.of("sessionId",s),401);pollAndAck(1,false);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(1);assertLedger();
    }

    @Test void concurrentReservationsAndRoleBoundariesHoldAcrossThePilot() throws Exception {
        Instant at=LocalDate.now(ZoneId.of("Europe/Belgrade")).plusDays(3).atTime(12,0).atZone(ZoneId.of("Europe/Belgrade")).toInstant();
        var body=Map.of("employeeId",id("employee-0"),"serviceId",id("service"),"resourceId",id("pc-0"),"startTime",at);
        var secondBody=new HashMap<String,Object>(body);secondBody.put("employeeId",id("employee-1"));
        var results=parallel(List.of(()->rawCommand("/api/v1/reservations",customer(0),body),()->rawCommand("/api/v1/reservations",customer(1),secondBody)));
        assertThat(results).extracting(n->n.get("status").asInt()).containsExactlyInAnyOrder(201,409);
        call(get("/api/v1/gaming-billing/report").param("from",Instant.now().minusSeconds(60).toString()).param("until",Instant.now().plusSeconds(60).toString()),staff(1),null,200);
        call(get("/api/v1/gaming-billing/report"),staff(2),null,403);
        call(get("/api/v1/gaming-operations/board"),customer(0),null,403);
        command("/api/v1/gaming-sessions",customer(0),start(0,0,0,"CASH",200),403);
        call(get("/api/v1/gaming-billing/customers/"+id("customer-1")),customer(0),null,403);
        call(get("/api/v1/gaming-operations/board"),machines.get(0),null,401);
        heartbeat(0,"RECOVERY_FAILED");command("/api/v1/gaming-sessions",staff(2),start(0,null,0,"CASH",200),409);
        heartbeat(0,null);jdbc.update("UPDATE gaming_station_profiles SET last_heartbeat_at=? WHERE resource_id=?",Timestamp.from(Instant.now().minusSeconds(120)),id("pc-0").toString());
        command("/api/v1/gaming-sessions",staff(2),start(0,null,0,"CASH",200),422);
    }

    @Test void databaseRestartAndLostFinancialResponseReplayTheCommittedResult() throws Exception {
        String key="pilot-lost-payment-response";var body=start(0,0,0,"CASH",200);
        var first=call(post("/api/v1/gaming-sessions").header("Idempotency-Key",key),staff(2),body,201);
        MYSQL.getDockerClient().restartContainerCmd(MYSQL.getContainerId()).withTimeout(5).exec();
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(90)).pollInterval(Duration.ofSeconds(1)).ignoreExceptions().until(()->jdbc.queryForObject("SELECT 1",Integer.class)==1);
        var replay=call(post("/api/v1/gaming-sessions").header("Idempotency-Key",key),staff(2),body,201);
        assertThat(replay).isEqualTo(first);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(1);
        pollAndAck(0,false);assertLedger();
    }
    void assertLedger() {
        assertThat(new com.game_manager.gm.gamingsession.billing.GamingLedgerHealth(jdbc,new io.micrometer.core.instrument.simple.SimpleMeterRegistry()).check()).isZero();
        assertThat(jdbc.queryForList("SELECT customer_id FROM gaming_wallet_ledger WHERE package_id IS NULL GROUP BY customer_id HAVING SUM(amount)<0")).isEmpty();
        assertThat(jdbc.queryForList("SELECT resource_id FROM gaming_sessions WHERE status='ACTIVE' GROUP BY resource_id HAVING COUNT(*)>1")).isEmpty();
        assertThat(jdbc.queryForList("SELECT customer_id FROM gaming_sessions WHERE status='ACTIVE' AND customer_id IS NOT NULL GROUP BY customer_id HAVING COUNT(*)>1")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_wallet_ledger WHERE amount<>0 AND operation_id IS NULL",Integer.class)).isZero();
    }
    static KeyPair keyPair(){try{return KeyPairGenerator.getInstance("Ed25519").generateKeyPair();}catch(GeneralSecurityException e){throw new ExceptionInInitializerError(e);}}
    static int freePort(){try(var socket=new java.net.ServerSocket(0)){return socket.getLocalPort();}catch(java.io.IOException e){throw new ExceptionInInitializerError(e);}}
}
