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
        jdbc.update("UPDATE gaming_business_policy SET minute_price=2.50,time_price_version=1 WHERE id=1");
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




    JsonNode rawCommand(String path,String token,Object body) throws Exception {var response=mvc.perform(request(post(path).header("Idempotency-Key",UUID.randomUUID()),token,body)).andReturn().getResponse();return json.valueToTree(Map.of("status",response.getStatus()));}






    JsonNode startVisit(int pc,int customer,int amount,int minutes)throws Exception {
        command("/api/v1/gaming-billing/customers/"+id("customer-"+customer)+"/time-grants",staff(2),Map.of("minutes",minutes,"priceVersion",1),200);
        command("/api/v1/gaming-billing/assignments",staff(2),Map.of("customerId",id("customer-"+customer),"resourceId",id("pc-"+pc)),200);
        var login=call(post("/api/v1/machine/session-login"),machines.get(pc),Map.of("email","customer-"+customer+"@pilot.example.test","password","PilotPass1!"),200);
        return call(get("/api/v1/gaming-sessions/"+login.get("sessionId").asText()),staff(2),null,200);
    }
    @Test void twoWavesPreserveCustomerTimeAndRequireLockBeforeReuse()throws Exception {
        for(int wave=0;wave<2;wave++)for(int pc=0;pc<5;pc++) {
            int c=wave*5+pc;var session=startVisit(pc,c,300+c,120);pollAndAck(pc,false);
            assertThat(lease(pc).get("billingMode").asText()).isEqualTo("TIME_BALANCE");
            call(post("/api/v1/machine/session-logout"),machines.get(pc),Map.of("sessionId",session.get("id").asText()),204);
            assertThat(lease(pc).get("directive").asText()).isEqualTo("LOCK");pollAndAck(pc,true);
            command("/api/v1/gaming-operations/stations/"+id("pc-"+pc)+"/prepare",staff(2),Map.of("sessionId",session.get("id").asText(),"isolatedProfileVerified",true,"reason","Synthetic isolated test fixture"),200);
            assertThat(jdbc.queryForObject("SELECT balance_seconds FROM gaming_time_accounts WHERE customer_id=?",Long.class,id("customer-"+c).toString())).isBetween(7100L,7200L);
        }
        assertLedger();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_charges",Integer.class)).isZero();
    }
    @Test void assignmentAndCredentialsAreRequiredBeforeASignedActiveLease()throws Exception {
        command("/api/v1/gaming-billing/customers/"+id("customer-0")+"/time-grants",staff(2),Map.of("minutes",180,"priceVersion",1),200);
        var assignment=command("/api/v1/gaming-billing/assignments",staff(2),Map.of("customerId",id("customer-0"),"resourceId",id("pc-0")),200);
        var waiting=lease(0);assertThat(waiting.get("directive").asText()).isEqualTo("LOCK");assertThat(waiting.get("assignmentId").asText()).isEqualTo(assignment.get("id").asText());
        call(post("/api/v1/machine/session-login"),machines.get(0),Map.of("email","customer-0@pilot.example.test","password","WrongPassword"),401);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_sessions",Integer.class)).isZero();
        call(post("/api/v1/machine/session-login"),machines.get(1),Map.of("email","customer-0@pilot.example.test","password","PilotPass1!"),401);
        var session=call(post("/api/v1/machine/session-login"),machines.get(0),Map.of("email","customer-0@pilot.example.test","password","PilotPass1!"),200);
        assertThat(lease(0).get("sessionId").asText()).isEqualTo(session.get("sessionId").asText());assertLedger();
    }
    @Test void financialResponseLossAndDatabaseRestartReplayOneDurableGrant()throws Exception {
        String path="/api/v1/gaming-billing/customers/"+id("customer-0")+"/time-grants",key="lost-manual-payment";
        var body=Map.of("minutes",120,"priceVersion",1);var first=call(post(path).header("Idempotency-Key",key),staff(2),body,200);
        MYSQL.getDockerClient().restartContainerCmd(MYSQL.getContainerId()).exec();
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(60)).ignoreExceptions().until(()->jdbc.queryForObject("SELECT 1",Integer.class)==1);
        assertThat(call(post(path).header("Idempotency-Key",key),staff(2),body,200)).isEqualTo(first);
        assertThat(jdbc.queryForObject("SELECT balance_seconds FROM gaming_time_accounts WHERE customer_id=?",Long.class,id("customer-0").toString())).isEqualTo(7200);assertLedger();
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
