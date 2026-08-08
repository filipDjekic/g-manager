package com.game_manager.gm.common.config;

import com.game_manager.gm.common.error.ApiError;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.core.converter.ResolvedSchema;
import io.swagger.v3.core.converter.AnnotatedType;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.Map;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {
    private static final String BEARER_AUTH = "bearerAuth";
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/api/v1/auth/register", "/api/v1/auth/login",
            "/api/v1/auth/refresh", "/api/v1/auth/logout");

    @Bean
    OpenAPI gManagerOpenApi() {
        ResolvedSchema resolved = ModelConverters.getInstance()
                .resolveAsResolvedSchema(new AnnotatedType(ApiError.class));
        Components components = new Components()
                .addSecuritySchemes(BEARER_AUTH, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT"));
        resolved.referencedSchemas.forEach(components::addSchemas);
        if (resolved.schema != null) {
            components.addSchemas("ApiError", resolved.schema);
        }
        return new OpenAPI()
                .info(new Info().title("G-Manager API").version("v1"))
                .components(components);
    }

    @Bean
    OpenApiCustomizer stableApiContract() {
        Map<String, String> standardErrors = Map.of(
                "400", "Request validation or syntax failed",
                "401", "Authentication is required",
                "403", "Access is denied",
                "409", "Request conflicts with current state",
                "429", "Rate limit exceeded",
                "500", "Unexpected server error");
        return openApi -> openApi.getPaths().forEach((path, item) ->
                item.readOperations().forEach(operation -> {
                    standardErrors.forEach((status, description) ->
                            operation.getResponses().putIfAbsent(status, errorResponse(description)));
                    if (!PUBLIC_PATHS.contains(path)) {
                        operation.addSecurityItem(new SecurityRequirement().addList(BEARER_AUTH));
                    }
                }));
    }

    private ApiResponse errorResponse(String description) {
        return new ApiResponse()
                .description(description)
                .content(new Content().addMediaType(
                        org.springframework.http.MediaType.APPLICATION_JSON_VALUE,
                        new MediaType().schema(new Schema<>().$ref("#/components/schemas/ApiError"))));
    }
}
