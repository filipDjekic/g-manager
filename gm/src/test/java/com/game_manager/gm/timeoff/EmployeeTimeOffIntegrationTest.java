package com.game_manager.gm.timeoff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.game_manager.gm.catalog.*; import com.game_manager.gm.common.security.Role; import com.game_manager.gm.user.*; import com.game_manager.gm.workinghours.*;
import java.math.BigDecimal; import java.time.*; import java.util.*;
import org.junit.jupiter.api.*; import org.springframework.beans.factory.annotation.Autowired; import org.springframework.boot.test.context.SpringBootTest; import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc; import org.springframework.http.MediaType; import org.springframework.jdbc.core.JdbcTemplate; import org.springframework.security.crypto.password.PasswordEncoder; import org.springframework.test.context.ActiveProfiles; import org.springframework.test.web.servlet.*; import testsupport.DatabaseCleaner; import tools.jackson.databind.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class EmployeeTimeOffIntegrationTest {
 private static final ZoneId ZONE=ZoneId.of("Europe/Belgrade");
 @Autowired MockMvc mvc;@Autowired UserRepository users;@Autowired CatalogRepository catalog;@Autowired WorkingHoursRepository hours;@Autowired PasswordEncoder encoder;@Autowired JdbcTemplate jdbc;private final ObjectMapper mapper=new ObjectMapper();
 @BeforeEach void clean(){DatabaseCleaner.clean(jdbc);}

 @Test void approvedTimeOffExcludesSlotsWhilePendingRejectedAndCancelledDoNotAcrossDst()throws Exception{
  User owner=user(Role.OWNER),customer=user(Role.CUSTOMER),employee=user(Role.EMPLOYEE);CatalogItem service=service();
  LocalDate date=ZONE.getRules().nextTransition(Instant.now()).getDateTimeAfter().toLocalDate();configure(date,LocalTime.MIDNIGHT,LocalTime.of(5,0));
  Instant start=ZonedDateTime.of(date,LocalTime.of(1,0),ZONE).toInstant(),end=start.plus(Duration.ofHours(2));String ownerToken=login(owner),customerToken=login(customer);
  mvc.perform(post("/api/v1/time-off").header("Authorization",bearer(customerToken)).contentType(MediaType.APPLICATION_JSON).content(request(employee,start,end))).andExpect(status().isForbidden());
  JsonNode created=node(mvc.perform(post("/api/v1/time-off").header("Authorization",bearer(ownerToken)).contentType(MediaType.APPLICATION_JSON).content(request(employee,start,end))).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING")).andReturn());
  assertThat(starts(customerToken,service,employee,date)).contains(start);
  decide(ownerToken,created,"APPROVED").andExpect(status().isOk());
  assertThat(starts(customerToken,service,employee,date)).doesNotContain(start);
  JsonNode approved=node(mvc.perform(get("/api/v1/time-off").header("Authorization",bearer(ownerToken))).andExpect(status().isOk()).andReturn()).get(0);
  decide(ownerToken,approved,"CANCELLED").andExpect(status().isOk());
  assertThat(starts(customerToken,service,employee,date)).contains(start);
  JsonNode replacement=node(mvc.perform(post("/api/v1/time-off").header("Authorization",bearer(ownerToken)).contentType(MediaType.APPLICATION_JSON).content(request(employee,start,end))).andExpect(status().isCreated()).andReturn());
  decide(ownerToken,replacement,"REJECTED").andExpect(status().isOk());
  assertThat(starts(customerToken,service,employee,date)).contains(start);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE resource_type='EMPLOYEE_TIME_OFF'",Integer.class)).isEqualTo(5);
 }

 @Test void overlapAndOptimisticLifecycleAreControlled()throws Exception{
  User owner=user(Role.OWNER),employee=user(Role.EMPLOYEE);String token=login(owner);Instant start=Instant.now().plus(Duration.ofDays(20)),end=start.plus(Duration.ofHours(8));
  JsonNode first=node(mvc.perform(post("/api/v1/time-off").header("Authorization",bearer(token)).contentType(MediaType.APPLICATION_JSON).content(request(employee,start,end))).andExpect(status().isCreated()).andReturn());
  mvc.perform(post("/api/v1/time-off").header("Authorization",bearer(token)).contentType(MediaType.APPLICATION_JSON).content(request(employee,start.plusSeconds(60),end.plusSeconds(60)))).andExpect(status().isConflict());
  mvc.perform(patch("/api/v1/time-off/{id}/status",first.get("id").asText()).header("Authorization",bearer(token)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REJECTED\",\"version\":99,\"reason\":\"Neusklađen zahtev\"}")).andExpect(status().isConflict());
  decide(token,first,"REJECTED").andExpect(status().isOk());
  mvc.perform(post("/api/v1/time-off").header("Authorization",bearer(token)).contentType(MediaType.APPLICATION_JSON).content(request(employee,start.plusSeconds(60),end.plusSeconds(60)))).andExpect(status().isCreated());
 }

 private ResultActions decide(String token,JsonNode value,String status)throws Exception{return mvc.perform(patch("/api/v1/time-off/{id}/status",value.get("id").asText()).header("Authorization",bearer(token)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\""+status+"\",\"version\":"+value.get("version").asLong()+",\"reason\":\"Odluka\"}"));}
 private String request(User employee,Instant start,Instant end){return "{\"employeeId\":\""+employee.getId()+"\",\"startsAt\":\""+start+"\",\"endsAt\":\""+end+"\",\"reason\":\"Planirano odsustvo\"}";}
 private Set<Instant> starts(String token,CatalogItem service,User employee,LocalDate date)throws Exception{JsonNode n=node(mvc.perform(get("/api/v1/availability").header("Authorization",bearer(token)).param("serviceId",service.getId().toString()).param("employeeId",employee.getId().toString()).param("from",date.toString()).param("to",date.toString())).andExpect(status().isOk()).andReturn());Set<Instant>s=new HashSet<>();n.at("/employees/0/slots").forEach(v->s.add(Instant.parse(v.get("startTime").asText())));return s;}
 private void configure(LocalDate date,LocalTime open,LocalTime close){WorkingHours h=hours.findByDayOfWeek(date.getDayOfWeek()).orElseThrow();h.setActive(true);h.setOpenTime(open);h.setCloseTime(close);hours.saveAndFlush(h);}
 private User user(Role role){return users.saveAndFlush(new User(role.name(),role+"-timeoff-"+UUID.randomUUID()+"@example.test",encoder.encode("StrongPass1!"),role,true,null));}
 private CatalogItem service(){CatalogItem v=new CatalogItem();v.setName("Time off service");v.setType(ItemType.SERVICE);v.setPrice(BigDecimal.TEN);v.setDurationMinutes(60);v.setActive(true);return catalog.saveAndFlush(v);}
 private String login(User u)throws Exception{return node(mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+u.getEmail()+"\",\"password\":\"StrongPass1!\"}")).andExpect(status().isOk()).andReturn()).get("token").asText();}
 private JsonNode node(MvcResult r){return mapper.readTree(r.getResponse().getContentAsByteArray());}private String bearer(String t){return "Bearer "+t;}
}
