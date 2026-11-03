package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import java.util.*;
import java.util.concurrent.*;
import java.time.*;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.*;

/** HTTP + real transactions + Flyway contracts; inherited admission tests also run against priced sessions. */
class GamingBillingIntegrationTest extends GamingSessionIntegrationTest {
    @Autowired com.game_manager.gm.security.JwtService jwt;
    @Autowired com.game_manager.gm.idempotency.IdempotencyService idempotency;
    private final ObjectMapper mapper=new ObjectMapper();
    private String token(User u){return jwt.issue(u.getId()).value();}
    private JsonNode call(MockHttpServletRequestBuilder request,String token,Object body,int expected) throws Exception {
        if(token!=null) request.header("Authorization","Bearer "+token);
        if(body!=null) request.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body));
        var response=mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse();
        return mapper.readTree(response.getContentAsByteArray().length==0?"{}":response.getContentAsString());
    }
    private JsonNode postCommand(String path,String token,Object body,int expected) throws Exception {
        return call(post(path).header("Idempotency-Key",UUID.randomUUID()),token,body,expected);
    }
    private Map<String,Object> payment(String method,String amount){return Map.of("method",method,"amount",amount);}
    private Map<String,Object> purchaseBody(int minutes,String method,String amount) {
        purchase(minutes);
        return Map.of("tariffId","00000000-0000-0000-0000-000000000043","tariffVersion",0,"payment",payment(method,amount));
    }
    private Map<String,Object> startBody(Station station,UUID customer,String method,String amount) {
        var body=new HashMap<String,Object>();body.put("resourceId",station.resource().getId());body.put("durationMinutes",60);
        if(customer==null) {
            var profile=stations.findByResourceId(station.resource().getId()).orElseThrow();profile.setClientEnabled(true);profile.setLastHeartbeatAt(Instant.now());stations.saveAndFlush(profile);
        }
        body.put(customer==null?"guestName":"customerId",customer==null?"Guest desk 1":customer);
        body.put("purchase",purchaseBody(60,method,amount));return body;
    }
    @Test void guestPaymentIsAtomicDurableIdempotentAndPrivacyBlocksReuse() throws Exception {
        var owner=user(Role.OWNER);var station=station();String token=token(owner);long accounts=users.count();
        var body=startBody(station,null,"CASH","200.00");String key=UUID.randomUUID().toString();
        var first=call(post("/api/v1/gaming-sessions").header("Idempotency-Key",key),token,body,201);
        String id=first.get("id").asText();
        call(post("/api/v1/gaming-sessions").header("Idempotency-Key",key),token,body,201);
        jdbc.update("UPDATE idempotency_keys SET expires_at=?",Timestamp.from(Instant.now().minusSeconds(3600)));idempotency.cleanupExpired();
        call(post("/api/v1/gaming-sessions").header("Idempotency-Key",key),token,body,201);
        assertThat(users.count()).isEqualTo(accounts);assertThat(sessions.count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(1);
        assertThat(call(get("/api/v1/gaming-billing/sessions/"+id),token,null,200).get("due").decimalValue()).isZero();
        postCommand("/api/v1/gaming-sessions/"+id+"/terminate",token,Map.of("version",first.get("version").asLong(),"reason","End guest visit"),200);
        postCommand("/api/v1/gaming-sessions",token,body,409);
        postCommand("/api/v1/gaming-operations/stations/"+station.resource().getId()+"/prepare",token,Map.of("sessionId",id,"isolatedProfileVerified",false,"reason","Lock only"),400);
        jdbc.update("UPDATE station_client_enforcement SET enforcement_status='LOCKED',last_lock_ack_at=? WHERE station_id=?",Timestamp.from(Instant.now()),station.resource().getId().toString());
        var overview=call(get("/api/v1/stations"),token,null,200);
        assertThat(overview.toString()).contains("PREPARATION_REQUIRED");
        postCommand("/api/v1/gaming-operations/stations/"+station.resource().getId()+"/prepare",token,Map.of("sessionId",id,"isolatedProfileVerified",true,"reason","Windows profile isolated, external accounts reviewed, saves preserved"),200);
        postCommand("/api/v1/gaming-sessions",token,body,201);
    }
    @Test void unpaidAndPosRulesRollbackEntitlementAndSnapshotSurvivesTariffEdit() throws Exception {
        var owner=user(Role.OWNER);String token=token(owner);var station=station();
        var body=startBody(station,null,"EXTERNAL_POS","200.00");postCommand("/api/v1/gaming-sessions",token,body,422);
        assertThat(sessions.count()).isZero();assertThat(stationCommands.count()).isZero();
        body=startBody(station,null,"CASH","50.00");postCommand("/api/v1/gaming-sessions",token,body,422);
        jdbc.update("UPDATE gaming_business_policy SET allow_partial=TRUE,allow_debt=TRUE");
        var started=postCommand("/api/v1/gaming-sessions",token,body,201);String id=started.get("id").asText();
        assertThat(call(get("/api/v1/gaming-billing/sessions/"+id),token,null,200).get("due").decimalValue()).isEqualByComparingTo("150.00");
        jdbc.update("UPDATE gaming_tariffs SET price=123.45,version=1");
        assertThat(jdbc.queryForObject("SELECT amount FROM gaming_charges WHERE session_id=?",java.math.BigDecimal.class,id)).isEqualByComparingTo("200.00");
        postCommand("/api/v1/gaming-sessions/"+id+"/extend",token,Map.of("minutes",30,"version",started.get("version").asLong(),"purchase",purchaseBody(30,"CASH","100")),409);
        postCommand("/api/v1/gaming-billing/sessions/"+id+"/payments",token,Map.of("payment",payment("CASH","150")),200);
        assertThat(call(get("/api/v1/gaming-billing/sessions/"+id),token,null,200).get("due").decimalValue()).isZero();
    }
    @Test void creditCannotBeDoubleSpentAcrossConcurrentStarts() throws Exception {
        var owner=user(Role.OWNER);var customer=user(Role.CUSTOMER);String token=token(owner);var a=station();var b=station();
        String topupPath="/api/v1/gaming-billing/customers/"+customer.getId()+"/topups",key=UUID.randomUUID().toString();
        var topup=Map.of("resourceId",a.resource().getId(),"payment",payment("CASH","250"),"reason","Cash received");
        call(post(topupPath).header("Idempotency-Key",key),token,topup,200);call(post(topupPath).header("Idempotency-Key",key),token,topup,200);
        var ready=new CountDownLatch(2);var go=new CountDownLatch(1);
        var first=startBody(a,customer.getId(),"WALLET","200");var second=startBody(b,customer.getId(),"WALLET","200");
        try(var pool=Executors.newFixedThreadPool(2)) {
            var f=pool.submit(()->raceStart(token,first,ready,go));var g=pool.submit(()->raceStart(token,second,ready,go));ready.await();go.countDown();
            assertThat(List.of(f.get(),g.get())).containsExactlyInAnyOrder(201,409);
        }
        assertThat(call(get("/api/v1/gaming-billing/customers/"+customer.getId()),token,null,200).get("balance").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_wallet_ledger WHERE kind='SESSION_USE'",Integer.class)).isEqualTo(1);
    }
    private int raceStart(String token,Object body,CountDownLatch ready,CountDownLatch go)throws Exception {
        ready.countDown();go.await();return mvc.perform(post("/api/v1/gaming-sessions").header("Authorization","Bearer "+token).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body))).andReturn().getResponse().getStatus();
    }
    @Test void timePackageHasExpiryConsumptionAndUnusedRefundRules() throws Exception {
        var owner=user(Role.OWNER);var customer=user(Role.CUSTOMER);String token=token(owner);var station=station();purchase(60);
        String base="/api/v1/gaming-billing/customers/"+customer.getId();
        postCommand(base+"/packages",token,Map.of("resourceId",station.resource().getId(),"tariffId","00000000-0000-0000-0000-000000000043","tariffVersion",0,"payment",payment("CASH","100")),200);
        var wallet=call(get(base),token,null,200);String pack=wallet.get("packages").get(0).get("id").asText();
        var body=startBody(station,customer.getId(),"TIME_PACKAGE","0");body.put("durationMinutes",30);
        body.put("purchase",Map.of("tariffId","00000000-0000-0000-0000-000000000043","tariffVersion",0,"payment",payment("TIME_PACKAGE","0"),"packageId",pack));
        jdbc.update("UPDATE gaming_time_packages SET expires_at=?",Timestamp.from(Instant.now().minusSeconds(60)));
        postCommand("/api/v1/gaming-sessions",token,body,422);assertThat(sessions.count()).isZero();
        jdbc.update("UPDATE gaming_time_packages SET expires_at=NULL");
        jdbc.update("UPDATE gaming_tariffs SET active=FALSE,price=999,version=version+1");
        postCommand("/api/v1/gaming-sessions",token,body,201);
        wallet=call(get(base),token,null,200);assertThat(wallet.get("packages").get(0).get("remaining_minutes").asInt()).isZero();
        jdbc.update("UPDATE gaming_business_policy SET allow_refunds=TRUE");
        String original=wallet.get("transactions").get(0).get("id").asText();
        postCommand(base+"/refunds",token,Map.of("paymentId",original,"amount","100","reason","Attempt used package refund"),422);
    }
    @Test void transferWaitsForRealLockAndPreservesTimeWithoutAnotherCharge() throws Exception {
        var owner=user(Role.OWNER);String token=token(owner);var source=station();var target=station();
        var targetResource=target.resource();targetResource.setAreaId(source.resource().getAreaId());targetResource.setServiceId(source.resource().getServiceId());resources.saveAndFlush(targetResource);
        var started=postCommand("/api/v1/gaming-sessions",token,startBody(source,null,"CASH","200"),201);String id=started.get("id").asText();
        var moving=postCommand("/api/v1/gaming-sessions/"+id+"/move",token,Map.of("targetResourceId",targetResource.getId(),"version",started.get("version").asLong()),200);
        postCommand("/api/v1/gaming-sessions/"+id+"/complete-move",token,Map.of("version",moving.get("version").asLong()),409);
        postCommand("/api/v1/gaming-sessions",token,startBody(target,null,"CASH","200"),409);
        jdbc.update("UPDATE station_client_enforcement SET enforcement_status='LOCKED',last_lock_ack_at=? WHERE station_id=?",Timestamp.from(Instant.now()),source.resource().getId().toString());
        var moved=postCommand("/api/v1/gaming-sessions/"+id+"/complete-move",token,Map.of("version",moving.get("version").asLong()),200);
        assertThat(moved.get("resourceId").asText()).isEqualTo(targetResource.getId().toString());
        assertThat(moved.get("remainingSeconds").asLong()).isBetween(3590L,3600L);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations WHERE kind='PAYMENT'",Integer.class)).isEqualTo(1);
    }
    @Test void permissionsRefundCapAndReportingSeparatePrepaidFromGaming() throws Exception {
        var owner=user(Role.OWNER);var employee=user(Role.EMPLOYEE);var customer=user(Role.CUSTOMER);var station=station();String token=token(owner);
        var started=postCommand("/api/v1/gaming-sessions",token,startBody(station,null,"CASH","200"),201);String id=started.get("id").asText();
        call(get("/api/v1/gaming-billing/sessions/"+id),token(employee),null,403);
        call(get("/api/v1/gaming-billing/customers/"+owner.getId()),token(customer),null,403);
        postCommand("/api/v1/gaming-sessions/"+id+"/terminate",token,Map.of("version",started.get("version").asLong(),"reason","Finished"),200);
        String original=call(get("/api/v1/gaming-billing/sessions/"+id),token,null,200).get("transactions").get(0).get("id").asText();
        var refund=Map.of("paymentId",original,"amount","100","reason","Authorized goodwill refund");
        postCommand("/api/v1/gaming-billing/sessions/"+id+"/refunds",token,refund,422);
        jdbc.update("UPDATE gaming_business_policy SET allow_refunds=TRUE");
        postCommand("/api/v1/gaming-billing/sessions/"+id+"/refunds",token(employee),refund,403);
        postCommand("/api/v1/gaming-billing/sessions/"+id+"/refunds",token,refund,200);
        postCommand("/api/v1/gaming-billing/sessions/"+id+"/refunds",token,Map.of("paymentId",original,"amount","101","reason","Over refund"),422);
        call(get("/api/v1/gaming-billing/report").param("from",Instant.now().minusSeconds(3600).toString()).param("until",Instant.now().plusSeconds(60).toString()),token,null,200);
    }
    @Test void decimalQuotesDiscountScopeAndPromotionsAreCheckedOnBackend() throws Exception {
        var owner=user(Role.OWNER);var employee=user(Role.EMPLOYEE);var station=station();purchase(60);String token=token(owner);
        jdbc.update("UPDATE gaming_tariffs SET price=100.05");
        var q=call(get("/api/v1/gaming-billing/quote").param("resourceId",station.resource().getId().toString()).param("tariffId","00000000-0000-0000-0000-000000000043").param("minutes","60").param("discount","12.5"),token,null,200);
        assertThat(q.get("total").decimalValue()).isEqualByComparingTo("175.09");
        call(get("/api/v1/gaming-billing/quote").param("resourceId",station.resource().getId().toString()).param("tariffId","00000000-0000-0000-0000-000000000043").param("minutes","45"),token,null,422);
        jdbc.update("INSERT INTO user_resource_assignments (id,user_id,resource_id,active,created_at,updated_at,version) VALUES (?,?,?,TRUE,?,?,0)",UUID.randomUUID().toString(),employee.getId().toString(),station.resource().getId().toString(),Timestamp.from(Instant.now()),Timestamp.from(Instant.now()));
        call(get("/api/v1/gaming-billing/quote").param("resourceId",station.resource().getId().toString()).param("tariffId","00000000-0000-0000-0000-000000000043").param("minutes","60").param("discount","1"),token(employee),null,403);
        jdbc.update("UPDATE gaming_tariffs SET valid_until=?",Timestamp.from(Instant.now().minusSeconds(60)));
        call(get("/api/v1/gaming-billing/quote").param("resourceId",station.resource().getId().toString()).param("tariffId","00000000-0000-0000-0000-000000000043").param("minutes","60"),token,null,422);
    }
    @Test void concurrentDebtPaymentsSerializeWithoutOverpayment() throws Exception {
        var owner=user(Role.OWNER);var station=station();String token=token(owner);
        jdbc.update("UPDATE gaming_business_policy SET allow_debt=TRUE,allow_partial=TRUE");
        String id=postCommand("/api/v1/gaming-sessions",token,startBody(station,null,"CASH","0"),201).get("id").asText();
        var ready=new CountDownLatch(2);var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Integer> pay=()->{ready.countDown();go.await();return mvc.perform(post("/api/v1/gaming-billing/sessions/"+id+"/payments").header("Authorization","Bearer "+token).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("payment",payment("CASH","150"))))).andReturn().getResponse().getStatus();};
            var a=pool.submit(pay);var b=pool.submit(pay);ready.await();go.countDown();assertThat(List.of(a.get(),b.get())).containsExactlyInAnyOrder(200,422);
        }
        assertThat(call(get("/api/v1/gaming-billing/sessions/"+id),token,null,200).get("due").decimalValue()).isEqualByComparingTo("50.00");
    }

    @Test void packageExtensionsSerializeAndAllocateTheExactOriginalPrice() throws Exception {
        var owner=user(Role.OWNER);var customer=user(Role.CUSTOMER);String token=token(owner);var station=station();purchase(60);
        jdbc.update("UPDATE gaming_tariffs SET minutes=180");
        var wallet=postCommand("/api/v1/gaming-billing/customers/"+customer.getId()+"/packages",token,Map.of("resourceId",station.resource().getId(),"tariffId","00000000-0000-0000-0000-000000000043","tariffVersion",0,"payment",payment("CASH","100")),200);
        String pack=wallet.get("packages").get(0).get("id").asText();
        var purchase=Map.of("tariffId","00000000-0000-0000-0000-000000000043","tariffVersion",0,"payment",payment("TIME_PACKAGE","0"),"packageId",pack);
        var body=startBody(station,customer.getId(),"TIME_PACKAGE","0");body.put("purchase",purchase);
        var started=postCommand("/api/v1/gaming-sessions",token,body,201);String id=started.get("id").asText();
        var ready=new CountDownLatch(2);var go=new CountDownLatch(1);
        var extension=Map.of("minutes",60,"version",started.get("version").asLong(),"purchase",purchase);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Integer> extend=()->{ready.countDown();go.await();return mvc.perform(post("/api/v1/gaming-sessions/"+id+"/extend").header("Authorization","Bearer "+token).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(extension))).andReturn().getResponse().getStatus();};
            var a=pool.submit(extend);var b=pool.submit(extend);ready.await();go.countDown();assertThat(List.of(a.get(),b.get())).containsExactlyInAnyOrder(200,409);
        }
        var current=call(get("/api/v1/gaming-sessions/"+id),token,null,200);
        postCommand("/api/v1/gaming-sessions/"+id+"/extend",token,Map.of("minutes",60,"version",current.get("version").asLong(),"purchase",purchase),200);
        assertThat(jdbc.queryForObject("SELECT SUM(recognized_amount) FROM gaming_charges WHERE session_id=?",java.math.BigDecimal.class,id)).isEqualByComparingTo("100.00");
        assertThat(jdbc.queryForObject("SELECT SUM(minutes) FROM gaming_wallet_ledger WHERE package_id=?",Integer.class,pack)).isZero();
    }

    @Test void authorizedRefundDoesNotRequireAnActiveGamingAccount() throws Exception {
        var owner=user(Role.OWNER);var customer=user(Role.CUSTOMER);var station=station();String token=token(owner);
        var wallet=postCommand("/api/v1/gaming-billing/customers/"+customer.getId()+"/topups",token,Map.of("resourceId",station.resource().getId(),"payment",payment("CASH","120"),"reason","Received cash top-up"),200);
        String original=wallet.get("transactions").get(0).get("id").asText();customer.setActive(false);users.saveAndFlush(customer);
        jdbc.update("UPDATE gaming_business_policy SET allow_refunds=TRUE");
        wallet=postCommand("/api/v1/gaming-billing/customers/"+customer.getId()+"/refunds",token,Map.of("paymentId",original,"amount","60","reason","Returning unused credit after account deactivation"),200);
        assertThat(wallet.get("balance").decimalValue()).isEqualByComparingTo("60.00");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_wallet_ledger WHERE operation_id IS NULL AND amount<>0",Integer.class)).isZero();
    }

}
