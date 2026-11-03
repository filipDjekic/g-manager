package com.game_manager.gm.gamingsession.command;

import java.time.Instant;
import java.util.UUID;

/** Board metadata without payload. A null sequence means the station has no retained command. */
public record StationCommandSummary(UUID stationId, Long sequence, StationCommandType commandType,
        Instant availableAt, Instant acknowledgedAt) {}
