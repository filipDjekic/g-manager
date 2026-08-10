package com.game_manager.gm.common.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "management.endpoints.web.exposure.include=health,prometheus")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ObservabilityIntegrationTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MeterRegistry meterRegistry;

    @Test
    void requestIdIsPropagatedAndMetricsUseBoundedRouteTags() throws Exception {
        mockMvc.perform(get("/actuator/health").header("X-Request-Id", "stage13-correlation"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Request-Id", "stage13-correlation"));

        assertThat(meterRegistry.find("gmanager.http.requests").timers())
                .anySatisfy(timer -> assertThat(timer.getId().getTag("route"))
                        .isEqualTo("/actuator/health"));

    }

    @Test
    void unknownPathsDoNotBecomeMetricTags() throws Exception {
        mockMvc.perform(get("/api/v1/not-a-real-resource/123456"))
                .andExpect(status().isUnauthorized());

        assertThat(meterRegistry.find("gmanager.http.requests").timers())
                .allSatisfy(timer -> assertThat(timer.getId().getTag("route"))
                        .doesNotContain("123456"));
    }

    @Test
    void livenessAndReadinessProbesAreAvailable() throws Exception {
        mockMvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
        mockMvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
    }
}
