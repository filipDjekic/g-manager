package com.game_manager.gm.common.config;

import java.util.UUID;

public interface DevelopmentStationPolicy {
    boolean enabled(UUID stationId);
    String mode(UUID stationId);
    boolean localEnvironment();
}
