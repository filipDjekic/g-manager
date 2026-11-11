package com.game_manager.gm.gamingsession;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.gamingsession.billing.*;
import com.game_manager.gm.machine.*;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.station.*;
import com.game_manager.gm.user.*;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
@Import(GamingTimeIntegrationTest.TimeConfiguration.class)
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class GamingTimeIntegrationTest {
 @TestConfiguration static class TimeConfiguration { @Bean @Primary TestClock gamingTimeClock(){return new TestClock();} }
 static class TestClock extends Clock { volatile Instant now=Instant.parse("2026-11-05T12:00:00Z");public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return this;}public Instant instant(){return now;} }
 @Autowired TestClock clock; @Autowired GamingTimeService time;
 @Autowired org.springframework.test.web.servlet.MockMvc mvc; @Autowired JdbcTemplate jdbc;
 @Autowired UserRepository users; @Autowired PasswordEncoder encoder; @Autowired CatalogRepository catalog;
 @Autowired LocationRepository locations; @Autowired AreaRepository areas; @Autowired PhysicalResourceRepository resources;
 @Autowired ApplicationProfileRepository profiles; @Autowired GamingStationProfileRepository stations; @Autowired GamingSessionRepository sessions;
 @Autowired com.game_manager.gm.security.JwtService jwt; @Autowired MachineProtocolService protocol;
 @Autowired org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor scheduler;
 @Autowired jakarta.persistence.EntityManagerFactory emf;
 @MockitoBean MachinePrincipalProvider principal;
 final ObjectMapper json=new ObjectMapper();
 @BeforeEach void reset(){scheduler.getScheduledTasks().forEach(t->t.cancel());testsupport.DatabaseCleaner.clean(jdbc);clock.now=Instant.parse("2026-11-05T12:00:00Z");org.mockito.Mockito.reset(principal);jdbc.update("UPDATE gaming_time_price SET minute_price=2.50,time_price_version=1 WHERE id=1");}
 String bearer(User user){return "Bearer "+jwt.issue(user.getId()).value();}
 JsonNode command(String path,User actor,Object body,String key,int status) throws Exception {
  var result=mvc.perform(post(path).header("Authorization",bearer(actor)).header("Idempotency-Key",key).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andExpect(status().is(status)).andReturn().getResponse();
  return json.readTree(result.getContentAsByteArray().length==0?"{}":result.getContentAsString());
 }
 JsonNode grant(User actor,User c,int minutes,String key,int status)throws Exception{return command("/api/v1/gaming-billing/customers/"+c.getId()+"/time-grants",actor,Map.of("minutes",minutes,"priceVersion",1),key,status);}
 JsonNode allocate(User actor,User c,Station s,int status)throws Exception{return command("/api/v1/gaming-billing/assignments",actor,Map.of("customerId",c.getId(),"resourceId",s.resource().getId()),UUID.randomUUID().toString(),status);}
 void managed(Station station){
  var p=stations.findByResourceId(station.resource().getId()).orElseThrow();p.setClientEnabled(true);p.setLastHeartbeatAt(clock.now);stations.saveAndFlush(p);
  jdbc.update("INSERT INTO station_client_enforcement(station_id,enforcement_status,created_at,updated_at,version) VALUES(?,'LOCKED',?,?,0)",station.resource().getId().toString(),Timestamp.from(clock.now),Timestamp.from(clock.now));
  // Synthetic readiness is an isolated database fixture, never a production LOCK_ACK.
  for(var day:DayOfWeek.values())jdbc.update("INSERT INTO working_hours(id,location_id,day_of_week,open_time,close_time,active,created_at,updated_at,version) VALUES(?,?,?,'00:00:00','23:59:59',TRUE,?,?,0)",UUID.randomUUID().toString(),station.locationId().toString(),day.name(),Timestamp.from(clock.now),Timestamp.from(clock.now));
 }
 void bind(Station station){when(principal.require()).thenReturn(new MachinePrincipal(UUID.randomUUID(),station.resource().getId(),1));when(principal.requireStationId()).thenReturn(station.resource().getId());}
 GamingSession activate(User c,Station station){bind(station);return time.activate(c.getId(),station.resource().getId());}
 void play(UUID id,int seconds){for(int elapsed=0;elapsed<seconds;elapsed+=10){clock.now=clock.now.plusSeconds(Math.min(10,seconds-elapsed));time.tick(id,true,false);}}
 @Test void paymentsUseConfiguredPriceAndAreDurableAndIdempotent()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);station();
  grant(owner,c,120,"payment-one",200);grant(owner,c,120,"payment-one",200);
  assertThat(time.balance(c.getId())).isEqualTo(7200);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations WHERE kind='TIME_GRANT'",Integer.class)).isEqualTo(1);
  grant(owner,c,180,"payment-two",200);assertThat(time.balance(c.getId())).isEqualTo(18000);
  grant(owner,c,121,"payment-one",409);emf.getCache().evictAll();assertThat(time.balance(c.getId())).isEqualTo(18000);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action='GAMING_TIME_GRANTED'",Integer.class)).isEqualTo(2);
 }
 @Test void externalPosReceiptsAreManualAndIdempotencyIncludesMethodAndReference()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);
  String path="/api/v1/gaming-billing/customers/"+c.getId()+"/time-grants";
  var body=Map.of("minutes",31,"priceVersion",1,"method","EXTERNAL_POS","reference","POS-42");
  command(path,owner,body,"pos-receipt",200);command(path,owner,body,"pos-receipt",200);
  command(path,owner,Map.of("minutes",31,"priceVersion",1,"method","CASH","reference","POS-42"),"pos-receipt",409);
  command(path,owner,Map.of("minutes",31,"priceVersion",1,"method","EXTERNAL_POS","reference","POS-43"),"pos-receipt",409);
  command(path,owner,Map.of("minutes",31,"priceVersion",1,"method","WALLET"),"unsupported",400);
  assertThat(time.balance(c.getId())).isEqualTo(1860);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(1);
  var payment=jdbc.queryForMap("SELECT method,amount,reference FROM gaming_financial_operations");
  assertThat(payment.get("method")).isEqualTo("EXTERNAL_POS");assertThat(payment.get("reference")).isEqualTo("POS-42");
  assertThat((BigDecimal)payment.get("amount")).isEqualByComparingTo("77.50");
 }
 @Test void archivedReceiptsAreReadableButNeverAddedToCurrentFinanceTotals()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);grant(owner,c,30,"new-payment",200);
  jdbc.update("INSERT INTO gaming_history_financial_operations(id,customer_id,actor_id,kind,method,amount,currency,status,created_at) VALUES(?,?,?,'CREDIT_TOPUP','CASH',500,'RSD','RECORDED',?)",
      UUID.randomUUID().toString(),c.getId().toString(),owner.getId().toString(),Timestamp.from(clock.now));
  var response=mvc.perform(get("/api/v1/gaming-billing/report").header("Authorization",bearer(owner))
      .param("from",clock.now.minusSeconds(1).toString()).param("until",clock.now.plusSeconds(1).toString())).andExpect(status().isOk()).andReturn();
  var report=json.readTree(response.getResponse().getContentAsByteArray());
  var totals=report.get("totals");var historical=report.get("historical");
  assertThat((totals.has("external_receipts")?totals.get("external_receipts"):totals.get("EXTERNAL_RECEIPTS")).asText()).isIn("75.00","75.0","75");
  assertThat((historical.has("external_receipts")?historical.get("external_receipts"):historical.get("EXTERNAL_RECEIPTS")).asText()).isIn("500.00","500.0","500");
  mvc.perform(get("/api/v1/gaming-billing/customers/"+c.getId()+"/time/historical-transactions").header("Authorization",bearer(c))).andExpect(status().isForbidden());
  assertThat(time.balance(c.getId())).isEqualTo(1800);
 }
 @Test void legacyPurchasesAndDirectSessionStartsAreUnavailable()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);
  for(String path:List.of("/api/v1/gaming-billing/tariffs","/api/v1/gaming-billing/customers/"+c.getId()+"/topups",
      "/api/v1/gaming-billing/customers/"+c.getId()+"/packages","/api/v1/gaming-sessions"))
   mvc.perform(post(path).header("Authorization",bearer(owner)).header("Idempotency-Key",UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().is4xxClientError());
  assertThat(time.balance(c.getId())).isZero();assertThat(sessions.count()).isZero();
 }
 @Test void onlyAuthorizedStaffCanAddAtLeastThirtyWholeMinutes()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var employee=user(Role.EMPLOYEE);var s=station();assign(employee,s.resource().getId());
  grant(c,c,30,"customer",403);grant(employee,c,29,"short",400);
  grant(owner,c,30,"minimum",200);grant(employee,c,31,"employee",200);grant(user(Role.ADMIN),c,45,"admin",200);
  grant(owner,c,0,"zero",400);grant(owner,c,-30,"negative",400);
  command("/api/v1/gaming-billing/customers/"+c.getId()+"/time-grants",owner,Map.of("minutes",30.5,"priceVersion",1),"fraction",400);
  assertThat(time.balance(c.getId())).isEqualTo(106*60);
  assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM gaming_financial_operations",BigDecimal.class)).isEqualByComparingTo("265.00");
  mvc.perform(get("/api/v1/gaming-billing/customers/"+c.getId()+"/time").header("Authorization",bearer(user(Role.CUSTOMER)))).andExpect(status().isForbidden());
 }
 @Test void assignmentDoesNotStartOrConsumeAndTimeoutReleasesStation()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var s=station();managed(s);allocate(owner,c,s,409);
  grant(owner,c,180,"credit",200);var a=allocate(owner,c,s,200);assertThat(a.get("status").asText()).isEqualTo("WAITING_FOR_LOGIN");
  assertThat(sessions.count()).isZero();assertThat(time.balance(c.getId())).isEqualTo(10800);
  clock.now=clock.now.plusSeconds(301);time.expireWaiting(clock.now);assertThat(time.waiting(s.resource().getId())).isNull();assertThat(time.balance(c.getId())).isEqualTo(10800);
 }
 @Test void failedLoginAndWrongStationNeverConsume()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var s=station();var other=station();managed(s);managed(other);grant(owner,c,120,"credit",200);allocate(owner,c,s,200);bind(other);
  assertThatThrownBy(()->time.activate(c.getId(),s.resource().getId())).isInstanceOf(com.game_manager.gm.common.error.ApplicationException.class);
  assertThatThrownBy(()->time.activate(c.getId(),other.resource().getId())).isInstanceOf(com.game_manager.gm.common.error.ApplicationException.class);
  assertThat(sessions.count()).isZero();assertThat(time.balance(c.getId())).isEqualTo(7200);
 }
 void loginMachine(Station station,User owner) {
  UUID identity=UUID.randomUUID();
  jdbc.update("INSERT INTO station_machine_identities(id,station_id,public_key_base64,public_key_fingerprint,key_version,status,enrolled_at,enrolled_by,created_at,updated_at,version) VALUES(?,?,'test-key',?,1,'ACTIVE',?,?,?,?,0)",identity.toString(),station.resource().getId().toString(),UUID.randomUUID().toString().replace("-","").repeat(2),Timestamp.from(clock.now),owner.getId().toString(),Timestamp.from(clock.now),Timestamp.from(clock.now));
  when(principal.require()).thenReturn(new MachinePrincipal(identity,station.resource().getId(),1));when(principal.requireStationId()).thenReturn(station.resource().getId());
 }
 @Test void credentialsOnlyActivateTheAssignedStationAfterSuccessfulValidation()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var s=station();managed(s);grant(owner,c,120,"credit",200);allocate(owner,c,s,200);loginMachine(s,owner);
  assertThatThrownBy(()->protocol.sessionLogin(new com.game_manager.gm.machine.dto.MachineDtos.SessionLoginRequest(c.getEmail(),"WrongPassword"))).isInstanceOf(com.game_manager.gm.common.error.ApplicationException.class);
  assertThat(sessions.count()).isZero();assertThat(time.balance(c.getId())).isEqualTo(7200);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM station_session_login_attempts WHERE outcome='INVALID_CREDENTIALS'",Integer.class)).isEqualTo(1);
  clock.now=clock.now.plusSeconds(12);var result=protocol.sessionLogin(new com.game_manager.gm.machine.dto.MachineDtos.SessionLoginRequest(c.getEmail(),"StrongPass1!"));
  assertThat(result.startedAt()).isEqualTo(clock.now);assertThat(sessions.findById(result.sessionId()).orElseThrow().getStatus()).isEqualTo(GamingSessionStatus.ACTIVE);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM station_session_login_attempts WHERE outcome='SUCCESS'",Integer.class)).isEqualTo(1);
 }
 @Test void activationEarlyFinishAndNextVisitOnAnotherStationPreserveSeconds()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();var b=station();managed(a);managed(b);grant(owner,c,180,"credit",200);allocate(owner,c,a,200);
  clock.now=clock.now.plusSeconds(15);var s=activate(c,a);assertThat(s.getStartedAt()).isEqualTo(clock.now);play(s.getId(),4200);time.tick(s.getId(),false,true);time.tick(s.getId(),false,true);
  assertThat(time.balance(c.getId())).isEqualTo(6600);assertThat(sessions.findById(s.getId()).orElseThrow().getBilledSeconds()).isEqualTo(4200);
  clock.now=clock.now.plusSeconds(600);var bp=stations.findByResourceId(b.resource().getId()).orElseThrow();bp.setLastHeartbeatAt(clock.now);stations.saveAndFlush(bp);
  allocate(owner,c,b,200);var resumed=activate(c,b);assertThat(resumed.getId()).isNotEqualTo(s.getId());assertThat(time.balance(c.getId())).isEqualTo(6600);
 }
 @Test void addingTimeDuringPlayExtendsAccessWithoutFinancialConsumption()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();managed(a);grant(owner,c,120,"credit",200);allocate(owner,c,a,200);var s=activate(c,a);play(s.getId(),20);
  grant(owner,c,60,"extra",200);var next=sessions.findById(s.getId()).orElseThrow();assertThat(next.getEndsAt()).isEqualTo(s.getEndsAt().plusSeconds(3600));
  assertThat(time.balance(c.getId())).isEqualTo(10780);assertThat(next.getBillingMode()).isEqualTo(GamingBillingMode.TIME_BALANCE);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_history_charges",Integer.class)).isZero();
 }
 @Test void expiredLeaseAfterBackendOrClientRestartBoundsAndDeduplicatesConsumption()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();managed(a);grant(owner,c,120,"credit",200);allocate(owner,c,a,200);var s=activate(c,a);
  clock.now=clock.now.plusSeconds(3600);emf.getCache().evictAll();time.tick(s.getId(),true,false);time.tick(s.getId(),true,false);time.tick(s.getId(),false,true);
  var ended=sessions.findById(s.getId()).orElseThrow();assertThat(ended.getBilledSeconds()).isEqualTo(30);assertThat(ended.getStatus()).isEqualTo(GamingSessionStatus.TERMINATED);assertThat(ended.getTerminationReason()).contains("RECOVERY_REQUIRED");assertThat(time.balance(c.getId())).isEqualTo(7170);
 }
 @Test void exactExhaustionCannotBecomeNegative()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();managed(a);grant(owner,c,30,"credit",200);allocate(owner,c,a,200);var s=activate(c,a);play(s.getId(),1805);
  assertThat(time.balance(c.getId())).isZero();assertThat(sessions.findById(s.getId()).orElseThrow().getStatus()).isEqualTo(GamingSessionStatus.EXPIRED);
 }
 @Test void concurrentConsumptionAndFinishCommitEachSecondOnce()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();managed(a);grant(owner,c,120,"credit",200);allocate(owner,c,a,200);var s=activate(c,a);clock.now=clock.now.plusSeconds(17);
  try(var pool=Executors.newFixedThreadPool(3)){var x=pool.submit(()->time.tick(s.getId(),false,false));var y=pool.submit(()->time.tick(s.getId(),false,true));var z=pool.submit(()->time.tick(s.getId(),false,true));x.get();y.get();z.get();}
  assertThat(time.balance(c.getId())).isEqualTo(7183);assertThat(jdbc.queryForObject("SELECT SUM(-delta_seconds) FROM gaming_time_ledger WHERE kind='CONSUMPTION'",Long.class)).isEqualTo(17);
 }
 @Test void concurrentAssignmentsRejectSharedCustomerOrStation()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();var b=station();managed(a);managed(b);grant(owner,c,120,"credit",200);
  try(var pool=Executors.newFixedThreadPool(2)){
   var gate=new CountDownLatch(1);var x=pool.submit(()->{gate.await();return assignmentStatus(owner,c,a);});var y=pool.submit(()->{gate.await();return assignmentStatus(owner,c,b);});gate.countDown();assertThat(List.of(x.get(),y.get())).containsExactlyInAnyOrder(200,409);
  }
  assertThat(sessions.count()).isZero();assertThat(time.balance(c.getId())).isEqualTo(7200);
 }
 int assignmentStatus(User actor,User c,Station s)throws Exception{return mvc.perform(post("/api/v1/gaming-billing/assignments").header("Authorization",bearer(actor)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("customerId",c.getId(),"resourceId",s.resource().getId())))).andReturn().getResponse().getStatus();}
 @Test void durablePurchaseKeySurvivesResponseCacheCleanupAndRejectsDifferentMinutes()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);grant(owner,c,30,"durable",200);
  jdbc.update("DELETE FROM idempotency_keys");grant(owner,c,30,"durable",200);
  jdbc.update("DELETE FROM idempotency_keys");grant(owner,c,31,"durable",409);
  assertThat(time.balance(c.getId())).isEqualTo(1800);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(1);
 }
 @Test void configuredPriceIsRequiredAndOnlyOwnerOrAdminCanChangeIt()throws Exception{
  var owner=user(Role.OWNER);var admin=user(Role.ADMIN);var employee=user(Role.EMPLOYEE);var c=user(Role.CUSTOMER);
  jdbc.update("UPDATE gaming_time_price SET minute_price=NULL,time_price_version=0");
  command("/api/v1/gaming-billing/customers/"+c.getId()+"/time-grants",owner,Map.of("minutes",30,"priceVersion",0),"unconfigured",409);
  for(var actor:List.of(employee,c))mvc.perform(put("/api/v1/gaming-billing/time-price").header("Authorization",bearer(actor)).contentType(MediaType.APPLICATION_JSON).content("{\"pricePerMinute\":2.50,\"version\":0}")).andExpect(status().isForbidden());
  mvc.perform(put("/api/v1/gaming-billing/time-price").header("Authorization",bearer(owner)).contentType(MediaType.APPLICATION_JSON).content("{\"pricePerMinute\":2.50,\"version\":0}")).andExpect(status().isOk());
  mvc.perform(put("/api/v1/gaming-billing/time-price").header("Authorization",bearer(admin)).contentType(MediaType.APPLICATION_JSON).content("{\"pricePerMinute\":3.25,\"version\":1}")).andExpect(status().isOk());
  grant(owner,c,30,"stale-price",409);
  command("/api/v1/gaming-billing/customers/"+c.getId()+"/time-grants",owner,Map.of("minutes",30,"priceVersion",2,"amount","0"),"current-price",200);
  assertThat(jdbc.queryForObject("SELECT amount FROM gaming_financial_operations",BigDecimal.class)).isEqualByComparingTo("97.50");
  assertThat(time.balance(c.getId())).isEqualTo(1800);
 }
 @Test void clientRestartBeforeLeaseExpiryClosesOldAccessAndRetainsUnusedTime()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();managed(a);grant(owner,c,120,"restart",200);allocate(owner,c,a,200);var session=activate(c,a);
  clock.now=clock.now.plusSeconds(13);time.recover(session.getId());time.tick(session.getId(),true,false);time.recover(session.getId());
  assertThat(time.balance(c.getId())).isEqualTo(7187);assertThat(sessions.findById(session.getId()).orElseThrow().getTerminationReason()).contains("RECOVERY_REQUIRED");
 }
 @Test void recordingPaymentDoesNotRequireAComputerAssignment()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);grant(owner,c,180,"no-station",200);
  assertThat(time.balance(c.getId())).isEqualTo(10800);assertThat(sessions.count()).isZero();
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_station_assignments",Integer.class)).isZero();
 }
 @Test void nextReservationLimitsAccessWithoutDestroyingTheRemainingBalance()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var other=user(Role.CUSTOMER);var employee=user(Role.EMPLOYEE);var a=station();managed(a);
  jdbc.update("INSERT INTO reservations(id,customer_id,employee_id,service_id,resource_id,location_id,start_time,end_time,status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,'CONFIRMED',?,?,0)",UUID.randomUUID().toString(),other.getId().toString(),employee.getId().toString(),a.resource().getServiceId().toString(),a.resource().getId().toString(),a.locationId().toString(),Timestamp.from(clock.now.plusSeconds(90)),Timestamp.from(clock.now.plusSeconds(180)),Timestamp.from(clock.now),Timestamp.from(clock.now));
  grant(owner,c,120,"before-booking",200);allocate(owner,c,a,200);var session=activate(c,a);
  assertThat(session.getEndsAt()).isEqualTo(clock.now.plusSeconds(90));play(session.getId(),100);
  assertThat(time.balance(c.getId())).isEqualTo(7110);assertThat(sessions.findById(session.getId()).orElseThrow().getTerminationReason()).contains("boundary");
 }
 @Test void repeatedSubsecondTicksUseCumulativeWholeSeconds()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var a=station();managed(a);grant(owner,c,120,"fractional",200);allocate(owner,c,a,200);var session=activate(c,a);
  for(int i=0;i<3;i++){clock.now=clock.now.plusMillis(900);time.tick(session.getId(),true,false);}
  time.tick(session.getId(),false,true);assertThat(time.balance(c.getId())).isEqualTo(7198);assertThat(sessions.findById(session.getId()).orElseThrow().getBilledSeconds()).isEqualTo(2);
 }
 @Test void concurrentPaymentsAndConsumptionKeepEveryPurchasedAndUsedSecond()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var pc=station();managed(pc);grant(owner,c,30,"initial",200);allocate(owner,c,pc,200);var session=activate(c,pc);
  clock.now=clock.now.plusSeconds(17);
  try(var pool=Executors.newFixedThreadPool(3)) {
   var a=pool.submit(()->{grant(owner,c,31,"parallel-a",200);return true;});
   var b=pool.submit(()->{grant(owner,c,45,"parallel-b",200);return true;});
   var usage=pool.submit(()->time.tick(session.getId(),false,false));a.get();b.get();usage.get();
  }
  time.tick(session.getId(),false,true);
  assertThat(time.balance(c.getId())).isEqualTo(106*60-17);
  assertThat(jdbc.queryForObject("SELECT SUM(-delta_seconds) FROM gaming_time_ledger WHERE kind='CONSUMPTION'",Long.class)).isEqualTo(17);
  assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM gaming_financial_operations",BigDecimal.class)).isEqualByComparingTo("265.00");
 }
 @Test void customerAndOperatorFinishAreScopedIdempotentAndRequireANewAssignment()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var other=user(Role.CUSTOMER);var employee=user(Role.EMPLOYEE);var pc=station();managed(pc);grant(owner,c,30,"initial",200);
  allocate(c,c,pc,403);allocate(employee,c,pc,403);allocate(owner,c,pc,200);var session=activate(c,pc);clock.now=clock.now.plusSeconds(13);
  mvc.perform(post("/api/v1/gaming-sessions/"+session.getId()+"/finish").header("Authorization",bearer(other))).andExpect(status().isForbidden());
  command("/api/v1/gaming-sessions/"+session.getId()+"/terminate",employee,Map.of("reason","End visit","version",session.getVersion()),"unscoped",403);
  command("/api/v1/gaming-sessions/"+session.getId()+"/terminate",owner,Map.of("reason","End visit","version",session.getVersion()),"staff-end",200);
  mvc.perform(post("/api/v1/gaming-sessions/"+session.getId()+"/finish").header("Authorization",bearer(c))).andExpect(status().isOk());
  assertThat(time.balance(c.getId())).isEqualTo(1787);
  assertThat(time.waiting(pc.resource().getId())).isNull();
  assertThat(sessions.existsByResourceIdAndStatus(pc.resource().getId(),GamingSessionStatus.ACTIVE)).isFalse();
  assertThat(jdbc.queryForObject("SELECT enforcement_status FROM station_client_enforcement WHERE station_id=?",String.class,pc.resource().getId().toString())).isEqualTo("LOCK_PENDING");
  assertThatThrownBy(()->activate(c,pc)).isInstanceOf(com.game_manager.gm.common.error.ApplicationException.class);
 }
 @Test void machineLogoutSettlesTimeAndFinancialHistoryRequiresStaffAuthorization()throws Exception{
  var owner=user(Role.OWNER);var c=user(Role.CUSTOMER);var pc=station();managed(pc);grant(owner,c,30,"initial",200);allocate(owner,c,pc,200);
  loginMachine(pc,owner);var session=time.activate(c.getId(),pc.resource().getId());
  clock.now=clock.now.plusSeconds(11);protocol.sessionLogout(new com.game_manager.gm.machine.dto.MachineDtos.SessionLogoutRequest(session.getId()));
  protocol.sessionLogout(new com.game_manager.gm.machine.dto.MachineDtos.SessionLogoutRequest(session.getId()));
  assertThat(time.balance(c.getId())).isEqualTo(1789);assertThat(sessions.findById(session.getId()).orElseThrow().getStatus()).isEqualTo(GamingSessionStatus.TERMINATED);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM station_session_login_attempts WHERE session_id=? AND outcome='LOGOUT'",Integer.class,session.getId().toString())).isEqualTo(2);
  mvc.perform(get("/api/v1/gaming-billing/customers/"+c.getId()+"/time/transactions").header("Authorization",bearer(c))).andExpect(status().isForbidden());
  mvc.perform(get("/api/v1/gaming-billing/customers/"+c.getId()+"/time/transactions").header("Authorization",bearer(owner))).andExpect(status().isOk());
 }
    Station station(){CatalogItem service=new CatalogItem();service.setName("Gaming "+shortId());service.setType(ItemType.SERVICE);service.setPrice(BigDecimal.TEN);service.setDurationMinutes(60);service.setActive(true);service=catalog.saveAndFlush(service);
        Location location=new Location();location.setCode("L-"+shortId());location.setName("Location");location.setAddress("Address");location.setTimezone("Europe/Belgrade");location.setActive(true);location=locations.saveAndFlush(location);
        Area area=new Area();area.setLocationId(location.getId());area.setCode("A-"+shortId());area.setName("Area");area.setActive(true);area=areas.saveAndFlush(area);
        PhysicalResource resource=new PhysicalResource();resource.setAreaId(area.getId());resource.setServiceId(service.getId());resource.setCode("PC-"+shortId());resource.setName("Gaming PC");resource.setType(ResourceType.GAMING_PC);resource.setActive(true);resource.setBookable(true);resource=resources.saveAndFlush(resource);
        ApplicationProfile profile=new ApplicationProfile();profile.setCode("P-"+shortId());profile.setName("Profile");profile.setActive(true);profile=profiles.saveAndFlush(profile);
        GamingStationProfile station=new GamingStationProfile();station.setResourceId(resource.getId());station.setApplicationProfileId(profile.getId());station.setOperationalStatus(StationOperationalStatus.AVAILABLE);stations.saveAndFlush(station);return new Station(resource,location.getId());}
    private void assign(User user,UUID resource){Instant now=Instant.now();jdbc.update("INSERT INTO user_resource_assignments (id,user_id,resource_id,active,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?)",UUID.randomUUID().toString(),user.getId().toString(),resource.toString(),true,Timestamp.from(now),Timestamp.from(now),0);}
    User user(Role role){User value=new User();value.setName(role.name());value.setEmail(role+"-gaming-"+UUID.randomUUID()+"@example.test");value.setPasswordHash(encoder.encode("StrongPass1!"));value.setRole(role);value.setActive(true);return users.saveAndFlush(value);}
 private static String shortId(){return UUID.randomUUID().toString().substring(0,8);} record Station(PhysicalResource resource,UUID locationId){}
}
