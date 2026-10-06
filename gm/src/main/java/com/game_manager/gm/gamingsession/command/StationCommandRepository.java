package com.game_manager.gm.gamingsession.command;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StationCommandRepository extends JpaRepository<StationCommand, UUID> {
    Optional<StationCommand> findByStationIdAndSequence(UUID stationId, Long sequence);
    List<StationCommand> findByStationIdAndSequenceGreaterThanOrderBySequence(UUID stationId, Long sequence);
    @org.springframework.data.jpa.repository.Query("""
            select c from StationCommand c where c.stationId in :stationIds
            and not exists (select newer.id from StationCommand newer
                where newer.stationId = c.stationId and newer.sequence > c.sequence)
            order by c.stationId, c.sequence desc
            """)
    List<StationCommand> findByStationIdInOrderByStationIdAscSequenceDesc(
            @org.springframework.data.repository.query.Param("stationIds") Collection<UUID> stationIds);
    List<StationCommand> findTop50ByStationIdOrderBySequenceDesc(UUID stationId);
    long deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(java.time.Instant cutoff);
}
