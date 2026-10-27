package com.game_manager.gm.common.scheduling;

import java.time.Instant;
import java.util.UUID;

/** Reservation admission, including its existing transaction/locking semantics. */
public interface ResourceAvailabilityPort {
    boolean isResourceAvailable(UUID resourceId, Instant start, Instant end, UUID excludeId);
    boolean isResourceAvailableForUpdate(UUID resourceId, Instant start, Instant end, UUID excludeId);
    void requireResourceAvailableForUpdate(UUID resourceId, Instant start, Instant end, UUID excludeId);
}
