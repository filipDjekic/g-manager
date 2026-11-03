package com.game_manager.gm.gamingsession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

import com.game_manager.gm.GmApplication;
import com.game_manager.gm.security.JwtService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import tools.jackson.databind.*;

/** Restarts the complete Spring application context over the same isolated InnoDB database. */
@Testcontainers
class PilotBackendRestartIT {
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("pilot_restart_it").withUsername("pilot").withPassword("disposable-pilot-password");
    ConfigurableApplicationContext start() {
        Map<String,Object> properties=new HashMap<>();
        properties.put("server.port",0);properties.put("spring.datasource.url",MYSQL.getJdbcUrl());
        properties.put("spring.datasource.username",MYSQL.getUsername());properties.put("spring.datasource.password",MYSQL.getPassword());
        properties.put("spring.datasource.driver-class-name",MYSQL.getDriverClassName());
        properties.put("app.gaming-client.policy-signing-private-key",Base64.getEncoder().encodeToString(PilotGamingCenterIT.SIGNING.getPrivate().getEncoded()));
        properties.put("app.gaming-client.policy-signing-key-id","pilot-ephemeral");
        return new SpringApplicationBuilder(GmApplication.class).profiles("test")
                .initializers(c->c.getEnvironment().getPropertySources().addFirst(new MapPropertySource("isolated-restart",properties))).run();
    }
    PilotGamingCenterIT fixture(ConfigurableApplicationContext context) {
        var f=new PilotGamingCenterIT();f.jdbc=context.getBean(JdbcTemplate.class);f.jwt=context.getBean(JwtService.class);
        f.passwords=context.getBean(PasswordEncoder.class);f.json=context.getBean(ObjectMapper.class);
        f.mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();return f;
    }
    JsonNode startOverHttp(ConfigurableApplicationContext context,PilotGamingCenterIT f,Map<String,Object> body,String key) throws Exception {
        int port=((org.springframework.boot.web.server.context.WebServerApplicationContext)context).getWebServer().getPort();
        try(var http=java.net.http.HttpClient.newHttpClient()) {
            var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:"+port+"/api/v1/gaming-sessions"))
                    .timeout(java.time.Duration.ofSeconds(15)).header("Authorization","Bearer "+f.staff(2)).header("Idempotency-Key",key)
                    .header("Content-Type","application/json").POST(java.net.http.HttpRequest.BodyPublishers.ofString(f.json.writeValueAsString(body))).build();
            var response=http.send(request,java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(201);return f.json.readTree(response.body());
        }
    }
    @Test void backendRestartReplaysCommittedStartAndItsFinancialRecordWithoutGrantingExtraTime() throws Exception {
        String key="pilot-backend-restart-payment";JsonNode original;Map<String,Object> body;List<String> machines;
        try(var first=start()) {
            var f=fixture(first);f.fixture();body=f.start(0,0,0,"CASH",200);
            original=startOverHttp(first,f,body,key);
            machines=List.copyOf(f.machines);
        }
        try(var second=start()) {
            var f=fixture(second);f.machines.addAll(machines);
            var replay=startOverHttp(second,f,body,key);
            assertThat(replay).isEqualTo(original);
            assertThat(f.jdbc.queryForObject("SELECT COUNT(*) FROM gaming_financial_operations",Integer.class)).isEqualTo(1);
            assertThat(java.time.Instant.parse(f.lease(0).get("sessionEndsAt").asText())).isCloseTo(java.time.Instant.parse(original.get("endsAt").asText()),org.assertj.core.api.Assertions.within(1,java.time.temporal.ChronoUnit.MILLIS));
            f.pollAndAck(0,false);f.assertLedger();
        }
    }
}
