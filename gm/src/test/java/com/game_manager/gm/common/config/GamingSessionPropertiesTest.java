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
                    "app.gaming-session.default-duration-minutes=120",
                    "app.gaming-session.maximum-duration-minutes=480",
                    "app.gaming-session.maximum-extension-minutes=120",
                    "app.gaming-session.heartbeat-interval-seconds=10",
                    "app.gaming-session.offline-grace-seconds=60",
                    "app.gaming-session.warning-threshold-minutes=15,5,1");

    @Test
    void bindsValidSessionLimitsAndWarnings() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(GamingSessionProperties.class);
            GamingSessionProperties properties = context.getBean(GamingSessionProperties.class);
            assertThat(properties.defaultDurationMinutes()).isEqualTo(120);
            assertThat(properties.warningThresholdMinutes()).containsExactly(15, 5, 1);
        });
    }

    @Test
    void rejectsInvertedDurationRange() {
        contextRunner.withPropertyValues(
                        "app.gaming-session.minimum-duration-minutes=180",
                        "app.gaming-session.default-duration-minutes=120")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void rejectsDuplicateOrAscendingWarningThresholds() {
        contextRunner.withPropertyValues(
                        "app.gaming-session.warning-threshold-minutes=5,5,15")
                .run(context -> assertThat(context).hasFailed());
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(GamingSessionProperties.class)
    static class PropertiesConfiguration {
    }
}
