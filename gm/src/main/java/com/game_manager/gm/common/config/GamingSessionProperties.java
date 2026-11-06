package com.game_manager.gm.common.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Reservation duration bounds and station health timing; gaming purchases use time accounts. */
@Validated
@ConfigurationProperties("app.gaming-session")
public record GamingSessionProperties(@Positive int minimumDurationMinutes, @Positive int maximumDurationMinutes,
        @Positive int heartbeatIntervalSeconds, @Positive int offlineGraceSeconds) {
    @AssertTrue(message="reservation duration limits must satisfy minimum <= maximum")
    public boolean isValidDurationRange() { return minimumDurationMinutes <= maximumDurationMinutes; }
}
