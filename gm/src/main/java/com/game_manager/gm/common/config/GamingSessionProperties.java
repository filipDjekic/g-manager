package com.game_manager.gm.common.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import java.util.HashSet;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app.gaming-session")
public record GamingSessionProperties(
        @Positive int minimumDurationMinutes,
        @Positive int defaultDurationMinutes,
        @Positive int maximumDurationMinutes,
        @Positive int maximumExtensionMinutes,
        @Positive int heartbeatIntervalSeconds,
        @Positive int offlineGraceSeconds,
        @NotEmpty List<@Positive Integer> warningThresholdMinutes
) {
    @AssertTrue(message = "gaming session duration limits must satisfy minimum <= default <= maximum")
    public boolean isValidDurationRange() {
        return minimumDurationMinutes <= defaultDurationMinutes
                && defaultDurationMinutes <= maximumDurationMinutes
                && maximumExtensionMinutes <= maximumDurationMinutes;
    }

    @AssertTrue(message = "gaming session warning thresholds must be unique and descending")
    public boolean isValidWarningThresholds() {
        if (warningThresholdMinutes == null || warningThresholdMinutes.isEmpty()) {
            return false;
        }
        if (new HashSet<>(warningThresholdMinutes).size() != warningThresholdMinutes.size()) {
            return false;
        }
        for (int index = 1; index < warningThresholdMinutes.size(); index++) {
            if (warningThresholdMinutes.get(index - 1) <= warningThresholdMinutes.get(index)) {
                return false;
            }
        }
        return warningThresholdMinutes.getFirst() < maximumDurationMinutes;
    }
}
