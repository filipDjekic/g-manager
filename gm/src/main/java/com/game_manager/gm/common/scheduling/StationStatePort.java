package com.game_manager.gm.common.scheduling;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

public interface StationStatePort {
    Map<UUID, String> operationalStates(Collection<UUID> resourceIds);
    default String operationalState(UUID resourceId) {
        return operationalStates(java.util.List.of(resourceId)).getOrDefault(resourceId, "AVAILABLE");
    }
}
