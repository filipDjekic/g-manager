package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.station.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.user.*;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.*;

@SpringBootTest(properties = {
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "logging.level.org.hibernate.engine.internal.StatisticalLoggingSessionEventListener=ERROR"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class GamingSessionIntegrationTest {
    @Autowired MockMvc mvc; @Autowired UserRepository users; @Autowired PasswordEncoder encoder;
    @Autowired CatalogRepository catalog; @Autowired LocationRepository locations; @Autowired AreaRepository areas;
    @Autowired PhysicalResourceRepository resources; @Autowired ApplicationProfileRepository profiles;
    @Autowired GamingStationProfileRepository stations; @Autowired GamingSessionRepository sessions;
    @Autowired StationCommandRepository stationCommands;
    @Autowired jakarta.persistence.EntityManagerFactory entityManagerFactory;
    @Autowired org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor scheduler;
    @Autowired JdbcTemplate jdbc; private final ObjectMapper json = new ObjectMapper();

    @org.junit.jupiter.api.BeforeEach void clean() {
        // This context is isolated by its statistics properties and closed after the class.
        // Keep scheduled enforcement writes out of fixture truncation and SQL-count assertions.
        scheduler.getScheduledTasks().forEach(task -> task.cancel());
        testsupport.DatabaseCleaner.clean(jdbc);
    }

    @Test void customerHistoryIsPrivateAndStaffHistoryRespectsAssignedLocations() throws Exception {
        User employee=user(Role.EMPLOYEE), unrelated=user(Role.EMPLOYEE), customer=user(Role.CUSTOMER), other=user(Role.CUSTOMER);
        Station station=station(); assign(employee,station.resource().getId()); String token=login(employee);
        start(token,startBody(customer,station.resource(),60),new CountDownLatch(0),new CountDownLatch(0));
        mvc.perform(get("/api/v1/gaming-sessions/me").header("Authorization",bearer(login(customer))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].resourceName").value("Gaming PC"));
        mvc.perform(get("/api/v1/gaming-sessions/me").header("Authorization",bearer(login(other))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/v1/gaming-sessions/customer/{id}",customer.getId()).header("Authorization",bearer(login(customer))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/gaming-sessions/customer/{id}",customer.getId()).header("Authorization",bearer(login(unrelated))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/v1/gaming-sessions/customer/{id}",customer.getId()).header("Authorization",bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test void commandsAreIdempotentAndExtensionKeepsAggregateIdentity() throws Exception {
        User employee=user(Role.EMPLOYEE), customer=user(Role.CUSTOMER); Station station=station(); assign(employee,station.resource().getId());
        String token=login(employee), key=UUID.randomUUID().toString(), body=startBody(customer,station.resource(),60);
        MvcResult first=mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",bearer(token))
                .header("Idempotency-Key",key).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.remainingSeconds").isNumber())
                .andExpect(jsonPath("$.serverTime").isString()).andReturn();
        MvcResult replay=mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",bearer(token))
                .header("Idempotency-Key",key).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(header().string("Idempotency-Replayed","true")).andReturn();
        JsonNode started=node(first); assertThat(node(replay).get("id").asText()).isEqualTo(started.get("id").asText());
        assertThat(stationCommands.findByStationIdAndSequenceGreaterThanOrderBySequence(
                station.resource().getId(), 0L)).extracting(StationCommand::getSequence).containsExactly(1L);
        String id=started.get("id").asText(); long version=started.get("version").asLong();
        MvcResult extended=mvc.perform(post("/api/v1/gaming-sessions/{id}/extend",id)
                .header("Authorization",bearer(token)).header("Idempotency-Key",UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":30,\"version\":"+version+",\"purchase\":"+purchase(30)+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id)).andReturn();
        long extendedVersion=node(extended).get("version").asLong();
        assertThat(stationCommands.findByStationIdAndSequenceGreaterThanOrderBySequence(
                station.resource().getId(), 0L)).extracting(StationCommand::getSequence).containsExactly(1L, 2L);
        mvc.perform(post("/api/v1/gaming-sessions/{id}/terminate",id).header("Authorization",bearer(token))
                .header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Customer requested logout\",\"version\":"+extendedVersion+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("TERMINATED"));
        assertThat(stationCommands.findByStationIdAndSequenceGreaterThanOrderBySequence(
                station.resource().getId(), 0L)).extracting(StationCommand::getSequence).containsExactly(1L, 2L, 3L);
        assertThat(sessions.count()).isEqualTo(1);
    }

    @Test void exactlyOneConcurrentStartWinsForSameStationAndForSameCustomer() throws Exception {
        User employee=user(Role.EMPLOYEE), first=user(Role.CUSTOMER), second=user(Role.CUSTOMER);
        Station one=station(),two=station();assign(employee,one.resource().getId());assign(employee,two.resource().getId());String token=login(employee);
        assertThat(race(token,startBody(first,one.resource(),60),startBody(second,one.resource(),60)))
                .containsExactlyInAnyOrder(201,409);
        sessions.findAll().forEach(value->{value.setStatus(GamingSessionStatus.TERMINATED);value.setEndedAt(Instant.now());value.setTerminationReason("test cleanup");sessions.save(value);});sessions.flush();jdbc.update("UPDATE station_preparation SET ready=TRUE");
        assertThat(race(token,startBody(first,one.resource(),60),startBody(first,two.resource(),60)))
                .containsExactlyInAnyOrder(201,409);
    }

    @Test void customerCannotUseManagementCommands() throws Exception {
        User customer=user(Role.CUSTOMER);Station station=station();
        mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",bearer(login(customer)))
                .header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                .content(startBody(customer,station.resource(),60))).andExpect(status().isForbidden());
    }

    // Inherited by GamingSessionConcurrencyIT so this regression runs on H2 and MySQL.
    @Test void latestCommandSummariesAreBoundedScopedAndIndependentOfTheDurableCursor() throws Exception {
        User employee=user(Role.EMPLOYEE), owner=user(Role.OWNER), customer=user(Role.CUSTOMER);
        Station busy=station(), other=station(), empty=station(), hidden=station();
        for (Station value:List.of(busy,other,empty)) assign(employee,value.resource().getId());
        Instant now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        GamingSession session=new GamingSession();session.setResourceId(busy.resource().getId());
        session.setLocationId(busy.locationId());session.setCustomerId(customer.getId());session.setStartedBy(owner.getId());
        session.setStartedAt(now.minusSeconds(60));session.setEndsAt(now.plusSeconds(3600));
        session.setStatus(GamingSessionStatus.ACTIVE);session=sessions.saveAndFlush(session);
        UUID sessionId=session.getId();
        jdbc.batchUpdate("""
                INSERT INTO station_commands (id,station_id,session_id,sequence,command_type,payload_version,
                    payload,correlation_id,available_at,acknowledged_at,expires_at,created_at,updated_at,version)
                VALUES (?,?,?,?,'SESSION_EXTENDED',1,?,'backlog',?,?,?,?,?,0)
                """, java.util.stream.IntStream.rangeClosed(1,5004).boxed().toList(),250,(statement,index)->{
                    boolean backlog=index<=5000;
                    UUID resourceId=backlog?busy.resource().getId():index<=5002?other.resource().getId():hidden.resource().getId();
                    statement.setString(1,UUID.randomUUID().toString());statement.setString(2,resourceId.toString());
                    statement.setString(3,sessionId.toString());statement.setLong(4,backlog?index:(index-5001)%2+1);
                    statement.setString(5,"{\"data\":\""+"x".repeat(4096)+"\"}");
                    statement.setTimestamp(6,Timestamp.from(now));
                    statement.setTimestamp(7,backlog?null:Timestamp.from(now));
                    statement.setTimestamp(8,Timestamp.from(now.plusSeconds(86400)));
                    statement.setTimestamp(9,Timestamp.from(now.minusSeconds(60)));statement.setTimestamp(10,Timestamp.from(now));
                });
        // The cursor survives retention and is not necessarily the latest retained command.
        jdbc.update("INSERT INTO station_command_sequences (station_id,last_sequence,updated_at) VALUES (?,?,?)",
                other.resource().getId().toString(),3L,Timestamp.from(now));
        List<UUID> visible=List.of(busy.resource().getId(),other.resource().getId(),empty.resource().getId());
        var statistics=entityManagerFactory.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        boolean statisticsEnabled=statistics.isStatisticsEnabled();statistics.setStatisticsEnabled(true);statistics.clear();
        try {
            var summaries=stationCommands.findLatestSummariesByStationIdIn(visible);
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
            assertThat(statistics.getEntityLoadCount()).isZero();
            assertThat(summaries).containsExactlyInAnyOrder(
                    new StationCommandSummary(busy.resource().getId(),5000L,StationCommandType.SESSION_EXTENDED,now,null),
                    new StationCommandSummary(other.resource().getId(),2L,StationCommandType.SESSION_EXTENDED,now,now),
                    new StationCommandSummary(empty.resource().getId(),null,null,null,null));
            assertThat(stationCommands.findLatestSummariesByStationIdIn(List.of())).isEmpty();
        } finally { statistics.setStatisticsEnabled(statisticsEnabled); }
        JsonNode board=node(mvc.perform(get("/api/v1/gaming-operations/board").header("Authorization",bearer(login(employee))))
                .andExpect(status().isOk()).andReturn()).get("stations");
        assertThat(board.size()).isEqualTo(3);
        for (JsonNode card:board) {
            UUID resourceId=UUID.fromString(card.get("resourceId").asText());
            assertThat(resourceId).isIn(visible);
            if (resourceId.equals(empty.resource().getId())) {
                assertThat(card.get("commandSequence").isNull()).isTrue();
                assertThat(card.get("commandType").isNull()).isTrue();
                assertThat(card.get("status").asText()).isEqualTo("AVAILABLE");
            } else {
                assertThat(card.get("commandSequence").asLong()).isEqualTo(resourceId.equals(busy.resource().getId())?5000:2);
                assertThat(card.get("commandType").asText()).isEqualTo("SESSION_EXTENDED");
                assertThat(card.get("commandAcknowledgedAt").isNull()).isEqualTo(resourceId.equals(busy.resource().getId()));
            }
        }
        jdbc.update("DELETE FROM station_commands WHERE station_id=? AND sequence=2",other.resource().getId().toString());
        assertThat(stationCommands.findLatestSummariesByStationIdIn(List.of(other.resource().getId())))
                .singleElement().extracting(StationCommandSummary::sequence).isEqualTo(1L);
        jdbc.update("DELETE FROM station_commands WHERE station_id=?",other.resource().getId().toString());
        assertThat(stationCommands.findLatestSummariesByStationIdIn(List.of(other.resource().getId())))
                .containsExactly(new StationCommandSummary(other.resource().getId(),null,null,null,null));
        assertThat(stationCommands.currentCursor(other.resource().getId().toString())).isEqualTo(3L);
    }

    private List<Integer> race(String token,String first,String second)throws Exception {CountDownLatch ready=new CountDownLatch(2),go=new CountDownLatch(1);
        try(ExecutorService pool=Executors.newFixedThreadPool(2)){Future<Integer>a=pool.submit(()->start(token,first,ready,go));Future<Integer>b=pool.submit(()->start(token,second,ready,go));ready.await();go.countDown();return List.of(a.get(),b.get());}}
    private int start(String token,String body,CountDownLatch ready,CountDownLatch go)throws Exception{ready.countDown();go.await();return mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",bearer(token)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus();}
    Station station(){CatalogItem service=new CatalogItem();service.setName("Gaming "+shortId());service.setType(ItemType.SERVICE);service.setPrice(BigDecimal.TEN);service.setDurationMinutes(60);service.setActive(true);service=catalog.saveAndFlush(service);
        Location location=new Location();location.setCode("L-"+shortId());location.setName("Location");location.setAddress("Address");location.setTimezone("Europe/Belgrade");location.setActive(true);location=locations.saveAndFlush(location);
        Area area=new Area();area.setLocationId(location.getId());area.setCode("A-"+shortId());area.setName("Area");area.setActive(true);area=areas.saveAndFlush(area);
        PhysicalResource resource=new PhysicalResource();resource.setAreaId(area.getId());resource.setServiceId(service.getId());resource.setCode("PC-"+shortId());resource.setName("Gaming PC");resource.setType(ResourceType.GAMING_PC);resource.setActive(true);resource.setBookable(true);resource=resources.saveAndFlush(resource);
        ApplicationProfile profile=new ApplicationProfile();profile.setCode("P-"+shortId());profile.setName("Profile");profile.setActive(true);profile=profiles.saveAndFlush(profile);
        GamingStationProfile station=new GamingStationProfile();station.setResourceId(resource.getId());station.setApplicationProfileId(profile.getId());station.setOperationalStatus(StationOperationalStatus.AVAILABLE);stations.saveAndFlush(station);return new Station(resource,location.getId());}
    private void assign(User user,UUID resource){Instant now=Instant.now();jdbc.update("INSERT INTO user_resource_assignments (id,user_id,resource_id,active,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?)",UUID.randomUUID().toString(),user.getId().toString(),resource.toString(),true,Timestamp.from(now),Timestamp.from(now),0);}
    User user(Role role){User value=new User();value.setName(role.name());value.setEmail(role+"-gaming-"+UUID.randomUUID()+"@example.test");value.setPasswordHash(encoder.encode("StrongPass1!"));value.setRole(role);value.setActive(true);return users.saveAndFlush(value);}
    private String login(User user)throws Exception{return node(mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail()))).andExpect(status().isOk()).andReturn()).get("token").asText();}
    private JsonNode node(MvcResult result){return json.readTree(result.getResponse().getContentAsByteArray());}
    private String startBody(User customer,PhysicalResource resource,int minutes){return "{\"customerId\":\"%s\",\"resourceId\":\"%s\",\"durationMinutes\":%d}".formatted(customer.getId(),resource.getId(),minutes).replace("}",",\"purchase\":"+purchase(minutes)+"}");}
    String purchase(int minutes) {
        String id="00000000-0000-0000-0000-000000000043";
        if(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_tariffs WHERE id=?",Integer.class,id)==0)
            jdbc.update("INSERT INTO gaming_tariffs (id,name,minutes,price,currency,active,package_validity_days,version) VALUES (?,'Test tariff',30,100,'RSD',TRUE,0,0)",id);
        return "{\"tariffId\":\""+id+"\",\"tariffVersion\":0,\"payment\":{\"method\":\"CASH\",\"amount\":"+(minutes/30*100)+"}}";
    }
    private static String bearer(String token){return "Bearer "+token;}private static String shortId(){return UUID.randomUUID().toString().substring(0,8);}record Station(PhysicalResource resource,UUID locationId){}
}
