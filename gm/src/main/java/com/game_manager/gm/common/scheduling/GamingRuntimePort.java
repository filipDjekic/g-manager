package com.game_manager.gm.common.scheduling;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public interface GamingRuntimePort {
    record Session(UUID id, UUID resourceId, String status) {}
    Set<UUID> activeResources(Collection<UUID> resourceIds);
    Map<UUID, Session> latest(Collection<UUID> resourceIds);
}
