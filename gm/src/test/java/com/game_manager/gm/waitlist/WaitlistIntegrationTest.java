package com.game_manager.gm.waitlist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.*;
import com.game_manager.gm.workinghours.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import testsupport.DatabaseCleaner;
import tools.jackson.databind.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class WaitlistIntegrationTest {
    @Autowired MockMvc mvc; @Autowired UserRepository users; @Autowired CatalogRepository catalog;
    @Autowired WorkingHoursRepository hours; @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate jdbc; @Autowired WaitlistService service;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach void clean(){DatabaseCleaner.clean(jdbc);}

    @Test void oldestCustomerGetsOnePrivateOfferAndAcceptanceIsIdempotent() throws Exception {
        Setup setup=setup();User first=user(Role.CUSTOMER),second=user(Role.CUSTOMER);
        String firstToken=login(first),secondToken=login(second),ownerToken=login(setup.owner());
        JsonNode occupied=reserve(firstToken,setup);join(secondToken,setup);join(firstToken,setup);
        cancelReservation(ownerToken,occupied);service.matchAvailable();service.matchAvailable();

        JsonNode secondList=list(secondToken);JsonNode firstList=list(firstToken);
        assertThat(secondList.size()).isEqualTo(1);assertThat(firstList.size()).isEqualTo(1);
        assertThat(secondList.get(0).get("status").asText()).isEqualTo("OFFERED");
        assertThat(firstList.get(0).get("status").asText()).isEqualTo("WAITING");
        String offerId=secondList.get(0).get("offerId").asText();
        JsonNode accepted=accept(secondToken,offerId,200);JsonNode replay=accept(secondToken,offerId,200);
        assertThat(replay.get("reservationId").asText()).isEqualTo(accepted.get("reservationId").asText());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='WAITLIST_OFFERED'",Integer.class)).isEqualTo(1);
    }

    @Test void expiredOfferCanBeRetriedButAcceptanceStillPerformsFinalAvailabilityCheck() throws Exception {
        Setup setup=setup();User waiting=user(Role.CUSTOMER),competitor=user(Role.CUSTOMER);String waitingToken=login(waiting),competitorToken=login(competitor),ownerToken=login(setup.owner());
        JsonNode occupied=reserve(competitorToken,setup);join(waitingToken,setup);cancelReservation(ownerToken,occupied);service.matchAvailable();
        String firstOffer=list(waitingToken).get(0).get("offerId").asText();
        JsonNode competing=reserve(competitorToken,setup);
        accept(waitingToken,firstOffer,409);
        cancelReservation(ownerToken,competing);
        jdbc.update("UPDATE waitlist_offers SET expires_at=DATEADD('MINUTE',-1,CURRENT_TIMESTAMP) WHERE id=?",firstOffer);
        service.matchAvailable();
        JsonNode retried=list(waitingToken).get(0);
        assertThat(retried.get("status").asText()).isEqualTo("OFFERED");
        assertThat(retried.get("offerId").asText()).isNotEqualTo(firstOffer);
        accept(waitingToken,firstOffer,409);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='WAITLIST_OFFERED'",Integer.class)).isEqualTo(2);
    }

    private Setup setup(){User owner=user(Role.OWNER),employee=user(Role.EMPLOYEE);CatalogItem item=new CatalogItem();item.setName("Waitlist service");item.setType(ItemType.SERVICE);item.setPrice(BigDecimal.TEN);item.setDurationMinutes(60);item.setActive(true);item=catalog.saveAndFlush(item);LocalDate date=LocalDate.now().plusDays(20);WorkingHours day=hours.findByDayOfWeek(date.getDayOfWeek()).orElseThrow();day.setActive(true);day.setOpenTime(LocalTime.of(8,0));day.setCloseTime(LocalTime.of(18,0));hours.saveAndFlush(day);Instant start=ZonedDateTime.of(date,LocalTime.of(10,0),ZoneId.of("Europe/Belgrade")).toInstant();return new Setup(owner,employee,item,start);}
    private void join(String token,Setup setup)throws Exception{mvc.perform(post("/api/v1/waitlist").header("Authorization",bearer(token)).contentType(MediaType.APPLICATION_JSON).content("{\"serviceId\":\""+setup.item().getId()+"\",\"employeeId\":\""+setup.employee().getId()+"\",\"desiredStart\":\""+setup.start()+"\"}")).andExpect(status().isCreated());}
    private JsonNode reserve(String token,Setup setup)throws Exception{return node(mvc.perform(post("/api/v1/reservations").header("Authorization",bearer(token)).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{\"serviceId\":\""+setup.item().getId()+"\",\"employeeId\":\""+setup.employee().getId()+"\",\"startTime\":\""+setup.start()+"\"}")).andExpect(status().isCreated()).andReturn());}
    private void cancelReservation(String token,JsonNode reservation)throws Exception{mvc.perform(patch("/api/v1/reservations/{id}/status",reservation.get("id").asText()).header("Authorization",bearer(token)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"CANCELLED\",\"reason\":\"Waitlist test\",\"version\":"+reservation.get("version").asLong()+"}")).andExpect(status().isOk());}
    private JsonNode list(String token)throws Exception{return node(mvc.perform(get("/api/v1/waitlist/me").header("Authorization",bearer(token))).andExpect(status().isOk()).andReturn());}
    private JsonNode accept(String token,String offer,int status)throws Exception{return node(mvc.perform(post("/api/v1/waitlist/offers/{id}/accept",offer).header("Authorization",bearer(token))).andExpect(status().is(status)).andReturn());}
    private User user(Role role){return users.saveAndFlush(new User(role.name(),role+"-waitlist-"+UUID.randomUUID()+"@example.test",encoder.encode("StrongPass1!"),role,true,null));}
    private String login(User user)throws Exception{return node(mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+user.getEmail()+"\",\"password\":\"StrongPass1!\"}")).andExpect(status().isOk()).andReturn()).get("token").asText();}
    private JsonNode node(MvcResult result){return mapper.readTree(result.getResponse().getContentAsByteArray());}private String bearer(String token){return "Bearer "+token;}
    private record Setup(User owner,User employee,CatalogItem item,Instant start){}
}
