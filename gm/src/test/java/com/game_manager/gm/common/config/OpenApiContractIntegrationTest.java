package com.game_manager.gm.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OpenApiContractIntegrationTest {
    private static final Set<String> REQUIRED_PATHS = Set.of(
            "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh",
            "/api/v1/auth/logout", "/api/v1/catalog", "/api/v1/catalog/{id}",
            "/api/v1/catalog/{id}/activate", "/api/v1/catalog/{id}/deactivate",
            "/api/v1/catalog/{id}/image", "/api/v1/dashboard/summary",
            "/api/v1/dashboard/today", "/api/v1/dashboard/trends", "/api/v1/dashboard/workload",
            "/api/v1/dashboard/export", "/api/v1/dashboard/widget-preferences",
            "/api/v1/notifications", "/api/v1/notifications/{id}/read",
            "/api/v1/notifications/read-all", "/api/v1/notifications/{id}/open",
            "/api/v1/notifications/preferences", "/api/v1/notifications/stream",
            "/api/v1/documents", "/api/v1/documents/{id}/versions",
            "/api/v1/documents/{id}/content", "/api/v1/documents/{id}",
            "/api/v1/documents/{id}/restore",
            "/api/v1/reports", "/api/v1/reports/definitions",
            "/api/v1/reports/{id}", "/api/v1/reports/{id}/download",
            "/api/v1/reports/{id}/cancel", "/api/v1/reports/schedules",
            "/api/v1/reports/templates", "/api/v1/reports/templates/{id}",
            "/api/v1/workflows", "/api/v1/workflows/definitions",
            "/api/v1/workflows/inbox", "/api/v1/workflows/mine",
            "/api/v1/workflows/{id}", "/api/v1/workflows/{id}/actions",
            "/api/v1/workflows/{id}/comments", "/api/v1/workflows/{id}/documents",
            "/api/v1/features", "/api/v1/features/bootstrap", "/api/v1/features/{flag}",
            "/api/v1/orders", "/api/v1/orders/me",
            "/api/v1/customers", "/api/v1/customers/{id}",
            "/api/v1/orders/{id}/status", "/api/v1/reservations",
            "/api/v1/reservations/me", "/api/v1/reservations/{id}/status",
            "/api/v1/users", "/api/v1/users/me", "/api/v1/users/me/password",
            "/api/v1/users/me/avatar", "/api/v1/users/employees",
            "/api/v1/users/{id}/deactivate", "/api/v1/working-hours",
            "/api/v1/working-hours/{dayOfWeek}", "/api/v1/working-hours/exceptions",
            "/api/v1/working-hours/exceptions/{id}");
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/api/v1/auth/register", "/api/v1/auth/login",
            "/api/v1/auth/refresh", "/api/v1/auth/logout");

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void generatedContractContainsEveryEndpointSecurityAndStandardErrors() throws Exception {
        JsonNode document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        JsonNode paths = document.get("paths");
        assertThat(REQUIRED_PATHS).allMatch(path -> paths.get(path) != null);
        assertThat(document.at("/components/securitySchemes/bearerAuth/type").asText())
                .isEqualTo("http");
        assertThat(document.at("/components/schemas/ApiError/properties/code")).isNotNull();
        assertThat(document.at("/components/schemas/ApiError/properties/fieldErrors")).isNotNull();

        REQUIRED_PATHS.forEach(path -> paths.get(path).properties().forEach(entry -> {
            JsonNode operation = entry.getValue();
            for (String status : Set.of("400", "401", "403", "409", "429", "500")) {
                assertThat(operation.at("/responses/" + status).isMissingNode())
                        .as("%s %s response", entry.getKey(), path).isFalse();
            }
            if (!PUBLIC_PATHS.contains(path)) {
                assertThat(operation.get("security")).as(path + " security").isNotNull();
            }
        }));
    }
}
