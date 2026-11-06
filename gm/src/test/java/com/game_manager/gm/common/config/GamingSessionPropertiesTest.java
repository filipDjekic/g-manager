package com.game_manager.gm.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class GamingSessionPropertiesTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfiguration.class)
            .withPropertyValues(
                    "app.gaming-session.minimum-duration-minutes=15",
                    "app.gaming-session.maximum-duration-minutes=480",
                    "app.gaming-session.heartbeat-interval-seconds=10",
                    "app.gaming-session.offline-grace-seconds=60");

    @Test
    void bindsReservationAndHeartbeatLimits() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(GamingSessionProperties.class);
            GamingSessionProperties properties = context.getBean(GamingSessionProperties.class);
            assertThat(properties.maximumDurationMinutes()).isEqualTo(480);
        });
    }

    @Test
    void rejectsInvertedDurationRange() {
        contextRunner.withPropertyValues(
                        "app.gaming-session.minimum-duration-minutes=600")
                .run(context -> assertThat(context).hasFailed());
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(GamingSessionProperties.class)
    static class PropertiesConfiguration {
    }
}
