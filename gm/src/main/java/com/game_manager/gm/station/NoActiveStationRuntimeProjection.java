package com.game_manager.gm.station;

import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnMissingBean(StationRuntimeProjectionPort.class)
public class NoActiveStationRuntimeProjection implements StationRuntimeProjectionPort {
    @Override public Map<UUID, UUID> activeSessionIdsByResource() { return Map.of(); }
}
