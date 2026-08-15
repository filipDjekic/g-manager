package com.game_manager.gm.station;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.user.*;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StationReadinessIntegrationTest {
    @Autowired MockMvc mvc; @Autowired UserRepository users; @Autowired PasswordEncoder encoder;
    @Autowired CatalogRepository catalog; @Autowired LocationRepository locations; @Autowired AreaRepository areas;
    @Autowired PhysicalResourceRepository resources; @Autowired ResourceManagementService resourceService;
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void adminConfiguresPolicyAndStationWhileEmployeeIsReadOnly() throws Exception {
        String admin = login(user(Role.ADMIN)); String employee = login(user(Role.EMPLOYEE));
        Setup setup = setup(ResourceType.GAMING_PC); Setup nonPc = setup(ResourceType.PLAYSTATION);
        String definition = """
                {"code":"GAME-%s","name":"Counter-Strike 2","type":"GAME",
                 "executablePath":"C:\\\\Games\\\\CS2\\\\cs2.exe","publisher":"Valve Corporation",
                 "active":true}
                """.formatted(shortId());
        MvcResult definitionResult = mvc.perform(post("/api/v1/stations/applications")
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(definition))
                .andExpect(status().isCreated()).andReturn();
        String definitionId = node(definitionResult).get("id").asText();
        String profile = """
                {"code":"PROFILE-%s","name":"Standard gaming","active":true,"entries":[
                 {"applicationDefinitionId":"%s","requiredProcess":false,"autoStart":false,"launchOrder":0}]}
                """.formatted(shortId(), definitionId);
        MvcResult profileResult = mvc.perform(post("/api/v1/stations/application-profiles")
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(profile))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.configurationVersion").value(1)).andReturn();
        String profileId = node(profileResult).get("id").asText();

        String maintenance = station("MAINTENANCE", profileId, null);
        MvcResult stationResult = mvc.perform(put("/api/v1/stations/{id}/profile", setup.resource().getId())
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON).content(maintenance))
                .andExpect(status().isOk()).andExpect(jsonPath("$.effectiveStatus").value("MAINTENANCE")).andReturn();
        long version = node(stationResult).get("version").asLong();
        assertThatThrownBy(() -> resourceService.requireBookable(setup.resource().getId(), setup.service().getId()))
                .isInstanceOf(ApplicationException.class);

        mvc.perform(get("/api/v1/stations").header("Authorization", bearer(employee)))
                .andExpect(status().isOk());
        mvc.perform(put("/api/v1/stations/{id}/profile", setup.resource().getId())
                .header("Authorization", bearer(employee)).contentType(MediaType.APPLICATION_JSON)
                .content(station("AVAILABLE", profileId, version))).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/stations/{id}/profile", nonPc.resource().getId())
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content(station("AVAILABLE", profileId, null))).andExpect(status().isUnprocessableEntity());
        mvc.perform(put("/api/v1/stations/{id}/profile", setup.resource().getId())
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content(station("RETIRED", profileId, version))).andExpect(status().isOk());
        mvc.perform(put("/api/v1/stations/{id}/profile", setup.resource().getId())
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content(station("AVAILABLE", profileId, version + 1))).andExpect(status().isConflict());
    }

    private Setup setup(ResourceType type) {
        CatalogItem service = new CatalogItem(); service.setName(type + " service " + shortId());
        service.setType(ItemType.SERVICE); service.setPrice(BigDecimal.TEN); service.setDurationMinutes(30); service.setActive(true);
        service = catalog.saveAndFlush(service);
        Location location = new Location(); location.setCode("L-" + shortId()); location.setName("Location");
        location.setAddress("Address"); location.setTimezone("Europe/Belgrade"); location.setActive(true); location = locations.saveAndFlush(location);
        Area area = new Area(); area.setLocationId(location.getId()); area.setCode("A-" + shortId()); area.setName("Area"); area.setActive(true); area = areas.saveAndFlush(area);
        PhysicalResource resource = new PhysicalResource(); resource.setAreaId(area.getId()); resource.setServiceId(service.getId());
        resource.setCode("R-" + shortId()); resource.setName(type + " station"); resource.setType(type); resource.setActive(true); resource.setBookable(true);
        return new Setup(service, resources.saveAndFlush(resource));
    }
    private User user(Role role) { User value = new User(); value.setName(role.name()); value.setEmail(role + "-station-" + UUID.randomUUID() + "@example.test"); value.setPasswordHash(encoder.encode("StrongPass1!")); value.setRole(role); value.setActive(true); return users.saveAndFlush(value); }
    private String login(User user) throws Exception { MvcResult result = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail()))).andExpect(status().isOk()).andReturn(); return node(result).get("token").asText(); }
    private JsonNode node(MvcResult result) { return json.readTree(result.getResponse().getContentAsByteArray()); }
    private static String station(String status, String profileId, Long version) { return "{\"operationalStatus\":\"%s\",\"applicationProfileId\":\"%s\",\"clientEnabled\":false,\"heartbeatIntervalSeconds\":10,\"offlineGraceSeconds\":60%s}".formatted(status, profileId, version == null ? "" : ",\"version\":" + version); }
    private static String bearer(String token) { return "Bearer " + token; }
    private static String shortId() { return UUID.randomUUID().toString().substring(0, 8); }
    private record Setup(CatalogItem service, PhysicalResource resource) {}
}
