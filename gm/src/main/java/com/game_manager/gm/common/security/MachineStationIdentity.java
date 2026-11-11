package com.game_manager.gm.common.security;

import java.util.UUID;

/** Authenticated station boundary, without a dependency on the machine protocol module. */
public interface MachineStationIdentity {
    UUID requireStationId();

    /** True only for the server-authenticated machine principal on the current thread. */
    default boolean isAuthenticatedMachine() { return false; }
}
