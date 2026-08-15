package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GamingSessionIntegrationTest {
    @Autowired MockMvc mvc; @Autowired UserRepository users; @Autowired PasswordEncoder encoder;
    @Autowired CatalogRepository catalog; @Autowired LocationRepository locations; @Autowired AreaRepository areas;
    @Autowired PhysicalResourceRepository resources; @Autowired ApplicationProfileRepository profiles;
    @Autowired GamingStationProfileRepository stations; @Autowired GamingSessionRepository sessions;
    @Autowired StationCommandRepository stationCommands;
    @Autowired JdbcTemplate jdbc; private final ObjectMapper json = new ObjectMapper();

    @Test void commandsAreIdempotentAndExtensionKeepsAggregateIdentity() throws Exception {
        User employee=user(Role.EMPLOYEE), customer=user(Role.CUSTOMER); Station station=station(); assign(employee,station.locationId());
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
                .contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":30,\"version\":"+version+"}"))
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
        Station one=station(),two=station();assign(employee,one.locationId());assign(employee,two.locationId());String token=login(employee);
        assertThat(race(token,startBody(first,one.resource(),60),startBody(second,one.resource(),60)))
                .containsExactlyInAnyOrder(201,409);
        sessions.findAll().forEach(value->{value.setStatus(GamingSessionStatus.TERMINATED);value.setEndedAt(Instant.now());value.setTerminationReason("test cleanup");sessions.save(value);});sessions.flush();
        assertThat(race(token,startBody(first,one.resource(),60),startBody(first,two.resource(),60)))
                .containsExactlyInAnyOrder(201,409);
    }

    @Test void customerCannotUseManagementCommands() throws Exception {
        User customer=user(Role.CUSTOMER);Station station=station();
        mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",bearer(login(customer)))
                .header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                .content(startBody(customer,station.resource(),60))).andExpect(status().isForbidden());
    }

    private List<Integer> race(String token,String first,String second)throws Exception {CountDownLatch ready=new CountDownLatch(2),go=new CountDownLatch(1);
        try(ExecutorService pool=Executors.newFixedThreadPool(2)){Future<Integer>a=pool.submit(()->start(token,first,ready,go));Future<Integer>b=pool.submit(()->start(token,second,ready,go));ready.await();go.countDown();return List.of(a.get(),b.get());}}
    private int start(String token,String body,CountDownLatch ready,CountDownLatch go)throws Exception{ready.countDown();go.await();return mvc.perform(post("/api/v1/gaming-sessions").header("Authorization",bearer(token)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus();}
    private Station station(){CatalogItem service=new CatalogItem();service.setName("Gaming "+shortId());service.setType(ItemType.SERVICE);service.setPrice(BigDecimal.TEN);service.setDurationMinutes(60);service.setActive(true);service=catalog.saveAndFlush(service);
        Location location=new Location();location.setCode("L-"+shortId());location.setName("Location");location.setAddress("Address");location.setTimezone("Europe/Belgrade");location.setActive(true);location=locations.saveAndFlush(location);
        Area area=new Area();area.setLocationId(location.getId());area.setCode("A-"+shortId());area.setName("Area");area.setActive(true);area=areas.saveAndFlush(area);
        PhysicalResource resource=new PhysicalResource();resource.setAreaId(area.getId());resource.setServiceId(service.getId());resource.setCode("PC-"+shortId());resource.setName("Gaming PC");resource.setType(ResourceType.GAMING_PC);resource.setActive(true);resource.setBookable(true);resource=resources.saveAndFlush(resource);
        ApplicationProfile profile=new ApplicationProfile();profile.setCode("P-"+shortId());profile.setName("Profile");profile.setActive(true);profile=profiles.saveAndFlush(profile);
        GamingStationProfile station=new GamingStationProfile();station.setResourceId(resource.getId());station.setApplicationProfileId(profile.getId());station.setOperationalStatus(StationOperationalStatus.AVAILABLE);stations.saveAndFlush(station);return new Station(resource,location.getId());}
    private void assign(User user,UUID location){Instant now=Instant.now();jdbc.update("INSERT INTO user_location_assignments (id,user_id,location_id,active,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?)",UUID.randomUUID().toString(),user.getId().toString(),location.toString(),true,Timestamp.from(now),Timestamp.from(now),0);}
    private User user(Role role){User value=new User();value.setName(role.name());value.setEmail(role+"-gaming-"+UUID.randomUUID()+"@example.test");value.setPasswordHash(encoder.encode("StrongPass1!"));value.setRole(role);value.setActive(true);return users.saveAndFlush(value);}
    private String login(User user)throws Exception{return node(mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail()))).andExpect(status().isOk()).andReturn()).get("token").asText();}
    private JsonNode node(MvcResult result){return json.readTree(result.getResponse().getContentAsByteArray());}
    private static String startBody(User customer,PhysicalResource resource,int minutes){return "{\"customerId\":\"%s\",\"resourceId\":\"%s\",\"durationMinutes\":%d}".formatted(customer.getId(),resource.getId(),minutes);}
    private static String bearer(String token){return "Bearer "+token;}private static String shortId(){return UUID.randomUUID().toString().substring(0,8);}private record Station(PhysicalResource resource,UUID locationId){}
}
