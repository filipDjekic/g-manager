package com.game_manager.gm.common.security;

import java.util.UUID;

/** Authenticated station boundary, without a dependency on the machine protocol module. */
public interface MachineStationIdentity {
    UUID requireStationId();
}
