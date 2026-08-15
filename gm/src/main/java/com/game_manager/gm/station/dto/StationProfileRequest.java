package com.game_manager.gm.station.dto;

import com.game_manager.gm.station.StationOperationalStatus;
import jakarta.validation.constraints.*;
import java.util.UUID;

public record StationProfileRequest(
        @NotNull StationOperationalStatus operationalStatus,
        UUID applicationProfileId,
        boolean clientEnabled,
        @Positive int heartbeatIntervalSeconds,
        @Positive int offlineGraceSeconds,
        Long version
) {
    @AssertTrue(message = "offline grace must be at least the heartbeat interval")
    public boolean isTimingValid() { return offlineGraceSeconds >= heartbeatIntervalSeconds; }
}
