package com.game_manager.gm.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class GManagerPropertiesValidationTest {
    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(PropertiesConfiguration.class)
                    .withPropertyValues(
                            "app.business-zone=Europe/Belgrade",
                            "app.cors-allowed-origins=http://localhost:5173",
                            "app.storage.local-root=target/test-uploads",
                            "app.idempotency.ttl-hours=24",
                            "app.idempotency.cleanup-cron=0 0 3 * * *",
                            "app.reservations.cancellation-cutoff-minutes=60",
                            "app.jwt.access-token-minutes=15",
                            "app.jwt.refresh-token-days=14",
                            "app.jwt.secure-cookie=false",
                            "app.initial-owner.name=Initial Owner",
                            "app.initial-owner.email=",
                            "app.initial-owner.password=");

    @Test
    void bindsValidTypedConfiguration() {
        contextRunner
                .withPropertyValues(
                        "app.jwt.secret=test-only-secret-with-at-least-32-bytes")
                .run(context -> {
                    assertThat(context).hasSingleBean(GManagerProperties.class);
                    GManagerProperties properties =
                            context.getBean(GManagerProperties.class);
                    assertThat(properties.businessZone().getId())
                            .isEqualTo("Europe/Belgrade");
                    assertThat(properties.corsAllowedOrigins())
                            .containsExactly("http://localhost:5173");
                });
    }

    @Test
    void rejectsInvalidJwtConfigurationAtStartup() {
        contextRunner
                .withPropertyValues("app.jwt.secret=too-short")
                .run(context -> {
                    assertThat(context).hasFailed();
                    Throwable rootCause = context.getStartupFailure();
                    while (rootCause.getCause() != null) {
                        rootCause = rootCause.getCause();
                    }
                    assertThat(rootCause)
                            .hasMessageContaining("app.jwt.secret");
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(GManagerProperties.class)
    static class PropertiesConfiguration {
    }
}
