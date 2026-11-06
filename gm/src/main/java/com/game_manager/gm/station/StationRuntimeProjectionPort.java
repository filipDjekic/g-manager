package com.game_manager.gm.station;

import java.util.Map;
import java.util.UUID;

public interface StationRuntimeProjectionPort {
    Map<UUID, UUID> activeSessionIdsByResource();
    default Map<UUID, UUID> waitingAssignmentsByResource() { return Map.of(); }
}
