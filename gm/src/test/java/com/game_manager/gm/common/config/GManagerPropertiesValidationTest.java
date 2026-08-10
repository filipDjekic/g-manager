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
                            "app.idempotency.in-progress-timeout-seconds=120",
                            "app.outbox.enabled=false",
                            "app.outbox.batch-size=10",
                            "app.outbox.poll-interval-millis=1000",
                            "app.outbox.lease-seconds=30",
                            "app.outbox.max-attempts=3",
                            "app.outbox.initial-backoff-seconds=2",
                            "app.outbox.retention-days=30",
                            "app.jobs.enabled=false",
                            "app.jobs.worker-count=2",
                            "app.jobs.queue-capacity=4",
                            "app.jobs.claim-batch-size=2",
                            "app.jobs.poll-interval-millis=1000",
                            "app.jobs.lease-seconds=30",
                            "app.jobs.timeout-seconds=60",
                            "app.jobs.max-attempts=3",
                            "app.jobs.initial-backoff-seconds=2",
                            "app.jobs.shutdown-wait-seconds=10",
                            "app.jobs.refresh-token-retention-days=30",
                            "app.jobs.audit-retention-days=365",
                            "app.reservations.cancellation-cutoff-minutes=60",
                            "app.notifications.email-enabled=false",
                            "app.notifications.delivery-batch-size=25",
                            "app.notifications.max-delivery-attempts=5",
                            "app.notifications.initial-backoff-seconds=10",
                            "app.notifications.retention-days=90",
                            "app.notifications.sse-timeout-seconds=1800",
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
