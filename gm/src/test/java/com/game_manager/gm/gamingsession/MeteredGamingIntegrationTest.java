package com.game_manager.gm.gamingsession;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.gamingsession.billing.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import tools.jackson.databind.*;
@Import(MeteredGamingIntegrationTest.TimeConfig.class)
class MeteredGamingIntegrationTest extends GamingSessionIntegrationTest {
    @TestConfiguration static class TimeConfig { @Bean @Primary ControlledClock meteredClock(){return new ControlledClock();} }
    static class ControlledClock extends Clock {
        Instant now=Instant.now(); public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId z){return this;} public Instant instant(){return now;}
    }
    @Autowired ControlledClock time;
    @Autowired MeteredSessionRuntime runtime;
    @Autowired com.game_manager.gm.reservation.ReservationRepository bookings;
    @Autowired com.game_manager.gm.security.JwtService jwt;
    final ObjectMapper mapper=new ObjectMapper();
    final UUID tariff=UUID.fromString("00000000-0000-0000-0000-000000000046");
    @BeforeEach void meteredSetup(){time.now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);jdbc.update("UPDATE gaming_business_policy SET allow_metered=TRUE,allow_fixed=TRUE,default_mode='FIXED_DURATION',billing_unit_seconds=1");jdbc.update("INSERT INTO gaming_tariffs (id,name,minutes,price,currency,active,package_validity_days,version) VALUES (?,'Metered',60,300,'RSD',TRUE,0,0)",tariff.toString());}
    String token(com.game_manager.gm.user.User u){return "Bearer "+jwt.issue(u.getId()).value();}
    UUID begin(Station station,com.game_manager.gm.user.User c,com.game_manager.gm.user.User owner) throws Exception {
        ready(station);
        String body=mapper.writeValueAsString(Map.of("customerId",c.getId(),"resourceId",station.resource().getId(),"billingMode","PREPAID_METERED","meteredTariffId",tariff));
        var response=mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",token(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andReturn();
        return UUID.fromString(mapper.readTree(response.getResponse().getContentAsByteArray()).get("id").asText());
    }
    // Finance fixtures simulate protocol readiness, never evidence of a physical Windows lock.
    void ready(Station value) {
        var profile=stations.findByResourceId(value.resource().getId()).orElseThrow();profile.setClientEnabled(true);profile.setLastHeartbeatAt(time.now);stations.saveAndFlush(profile);
        if(jdbc.queryForObject("SELECT COUNT(*) FROM station_client_enforcement WHERE station_id=?",Integer.class,value.resource().getId().toString())==0)
            jdbc.update("INSERT INTO station_client_enforcement (station_id,enforcement_status,created_at,updated_at,version) VALUES (?,'LOCKED',?,?,0)",value.resource().getId().toString(),java.sql.Timestamp.from(time.now),java.sql.Timestamp.from(time.now));
    }
    void topup(Station station,com.game_manager.gm.user.User c,com.game_manager.gm.user.User owner,String amount) throws Exception {
        mvc.perform(post("/api/v1/gaming-billing/customers/"+c.getId()+"/topups").header("Authorization",token(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("resourceId",station.resource().getId(),"payment",Map.of("method","CASH","amount",amount),"reason","Prepaid topup")))).andExpect(status().isOk());
    }
    BigDecimal credit(UUID c){return jdbc.queryForObject("SELECT SUM(amount) FROM gaming_wallet_ledger WHERE customer_id=?",BigDecimal.class,c.toString());}
    void play(UUID id,int seconds){for(int elapsed=0;elapsed<seconds;elapsed+=10){time.now=time.now.plusSeconds(Math.min(10,seconds-elapsed));runtime.tick(id,true);}}
    @Test void meteredTwentyMinutesThenAnotherStationNextDayAndDuplicateFinish() throws Exception {
        var owner=user(Role.OWNER);var customer=user(Role.CUSTOMER);var a=station();topup(a,customer,owner,"1000");var id=begin(a,customer,owner);
        assertThat(credit(customer.getId())).isEqualByComparingTo("1000");play(id,1200);
        mvc.perform(post("/api/v1/gaming-sessions/"+id+"/finish").header("Authorization",token(customer))).andExpect(status().isOk());
        assertThat(credit(customer.getId())).isEqualByComparingTo("900");assertThat(sessions.findById(id).orElseThrow().getChargedAmount()).isEqualByComparingTo("100");
        mvc.perform(get("/api/v1/gaming-sessions/me/history").header("Authorization",token(customer))).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].billingMode").value("PREPAID_METERED")).andExpect(jsonPath("$.content[0].billedSeconds").value(1200)).andExpect(jsonPath("$.content[0].chargedAmount").value(100));
        mvc.perform(post("/api/v1/gaming-sessions/"+id+"/finish").header("Authorization",token(customer))).andExpect(status().isOk());
        time.now=time.now.plus(Duration.ofDays(1));runtime.tick(id,false);assertThat(credit(customer.getId())).isEqualByComparingTo("900");
        var b=station();var next=begin(b,customer,owner);assertThat(next).isNotEqualTo(id);assertThat(credit(customer.getId())).isEqualByComparingTo("900");
    }
    @Test void meteredLeaseLossStopsBillingAndCannotResumeAfterRestart() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1000");var id=begin(station,c,owner);
        time.now=time.now.plusSeconds(3600);runtime.tick(id,true);
        var s=sessions.findById(id).orElseThrow();assertThat(s.getStatus()).isEqualTo(GamingSessionStatus.EXPIRED);assertThat(s.getBilledSeconds()).isEqualTo(30);assertThat(credit(c.getId())).isEqualByComparingTo("997.50");
        runtime.tick(id,true);assertThat(credit(c.getId())).isEqualByComparingTo("997.50");
    }
    @Test void meteredCreditExhaustionNeverNegativeAndTariffFrozen() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1");var id=begin(station,c,owner);
        jdbc.update("UPDATE gaming_tariffs SET price=900,version=version+1 WHERE id=?",tariff.toString());play(id,20);
        assertThat(credit(c.getId())).isEqualByComparingTo("0");assertThat(sessions.findById(id).orElseThrow().getBilledSeconds()).isEqualTo(12);
        assertThat(sessions.findById(id).orElseThrow().getStatus()).isEqualTo(GamingSessionStatus.EXPIRED);
    }
    @Test void meteredDuplicateConcurrentTicksAndOwnAuthorization() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var other=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1000");var id=begin(station,c,owner);
        time.now=time.now.plusSeconds(20);
        try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(()->runtime.tick(id,false));var b=pool.submit(()->runtime.tick(id,false));a.get();b.get();}
        assertThat(credit(c.getId())).isEqualByComparingTo("998.33");
        mvc.perform(post("/api/v1/gaming-sessions/"+id+"/finish").header("Authorization",token(other))).andExpect(status().isForbidden());
        var b=station();String body=mapper.writeValueAsString(Map.of("customerId",c.getId(),"resourceId",b.resource().getId(),"billingMode","PREPAID_METERED","meteredTariffId",tariff));
        mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",token(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
    }
    @Test void meteredConcurrentStartsAndProtectedCoverage() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();var b=station();topup(a,c,owner,"1000");
        ready(a);ready(b);
        var gate=new CountDownLatch(1);
        java.util.function.Function<Station,Callable<Integer>> attempt=station->()->{gate.await();return mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",token(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("customerId",c.getId(),"resourceId",station.resource().getId(),"billingMode","PREPAID_METERED","meteredTariffId",tariff)))).andReturn().getResponse().getStatus();};
        try(var pool=Executors.newFixedThreadPool(2)){var x=pool.submit(attempt.apply(a));var y=pool.submit(attempt.apply(b));gate.countDown();assertThat(List.of(x.get(),y.get())).containsExactlyInAnyOrder(201,409);}
        mvc.perform(post("/api/v1/gaming-billing/customers/"+c.getId()+"/adjustments").header("Authorization",token(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("resourceId",a.resource().getId(),"amount","-1000","reason","Withdrawal during gaming")))).andExpect(status().isConflict());
        assertThat(credit(c.getId())).isEqualByComparingTo("1000");
    }
    @Test void meteredConcurrentEarlyFinishAndBillingDoNotDoubleCharge() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1000");var id=begin(station,c,owner);time.now=time.now.plusSeconds(17);
        try(var pool=Executors.newFixedThreadPool(2)){var x=pool.submit(()->runtime.finish(id));var y=pool.submit(()->runtime.tick(id,false));x.get();y.get();}
        runtime.finish(id);assertThat(sessions.findById(id).orElseThrow().getBilledSeconds()).isEqualTo(17);assertThat(credit(c.getId())).isEqualByComparingTo("998.58");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM gaming_financial_operations WHERE session_id=? AND kind='PAYMENT'",BigDecimal.class,id.toString())).isEqualByComparingTo("1.42");
    }

    @Test void meteredStartedSecondIsChargedWithoutWaitingForAWholeSecond() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1000");var id=begin(station,c,owner);
        time.now=time.now.plusMillis(500);runtime.finish(id);
        assertThat(sessions.findById(id).orElseThrow().getBilledSeconds()).isEqualTo(1);
        assertThat(credit(c.getId())).isEqualByComparingTo("999.92");
    }

    @Test void meteredTopupDuringPlayExtendsFundedAccessWithoutAdvanceCharge() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1");var id=begin(station,c,owner);
        var before=sessions.findById(id).orElseThrow().getEndsAt();play(id,10);topup(station,c,owner,"1");
        assertThat(credit(c.getId())).isEqualByComparingTo("1.17");
        assertThat(sessions.findById(id).orElseThrow().getEndsAt()).isEqualTo(before.plusSeconds(12));
        runtime.tick(id,true);play(id,14);
        assertThat(credit(c.getId())).isEqualByComparingTo("0");assertThat(sessions.findById(id).orElseThrow().getBilledSeconds()).isEqualTo(24);
    }

    @Test void meteredTopupCannotDisplaceAnExistingReservation() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1");var id=begin(station,c,owner);
        var booking=new com.game_manager.gm.reservation.Reservation();booking.setCustomerId(c.getId());booking.setEmployeeId(owner.getId());booking.setServiceId(station.resource().getServiceId());booking.setLocationId(station.locationId());booking.setResourceId(station.resource().getId());booking.setStartTime(time.now.plusSeconds(18));booking.setEndTime(time.now.plusSeconds(3600));booking.setStatus(com.game_manager.gm.reservation.ReservationStatus.CONFIRMED);bookings.saveAndFlush(booking);
        play(id,10);topup(station,c,owner,"1");assertThat(sessions.findById(id).orElseThrow().getEndsAt()).isEqualTo(booking.getStartTime());
        runtime.tick(id,true);play(id,8);assertThat(credit(c.getId())).isEqualByComparingTo("0.50");assertThat(sessions.findById(id).orElseThrow().getTerminationReason()).contains("boundary");
    }

    @Test void meteredCannotStartWithoutManagedClientEnforcement() throws Exception {
        var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var station=station();topup(station,c,owner,"1000");
        mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",token(owner)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("customerId",c.getId(),"resourceId",station.resource().getId(),"billingMode","PREPAID_METERED","meteredTariffId",tariff)))).andExpect(status().isUnprocessableEntity());
        assertThat(sessions.count()).isZero();assertThat(credit(c.getId())).isEqualByComparingTo("1000");
    }

}
