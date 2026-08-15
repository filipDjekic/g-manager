package com.game_manager.gm.gamingsession.command;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StationCommandRepository extends JpaRepository<StationCommand, UUID> {
    Optional<StationCommand> findByStationIdAndSequence(UUID stationId, Long sequence);
    List<StationCommand> findByStationIdAndSequenceGreaterThanOrderBySequence(UUID stationId, Long sequence);
    List<StationCommand> findByStationIdInOrderByStationIdAscSequenceDesc(Collection<UUID> stationIds);
    long deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(java.time.Instant cutoff);
}
