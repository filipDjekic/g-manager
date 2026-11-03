package com.game_manager.gm.gamingsession.command;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StationCommandRepository extends JpaRepository<StationCommand, UUID> {
    @org.springframework.data.jpa.repository.Query(value="SELECT COALESCE((SELECT last_sequence FROM station_command_sequences WHERE station_id=:stationId),0)",nativeQuery=true)
    long currentCursor(@org.springframework.data.repository.query.Param("stationId") String stationId);
    Optional<StationCommand> findByStationIdAndSequence(UUID stationId, Long sequence);
    List<StationCommand> findByStationIdAndSequenceGreaterThanOrderBySequence(UUID stationId, Long sequence);
    List<StationCommand> findByStationIdAndSequenceGreaterThanAndAvailableAtLessThanEqualOrderBySequence(
            UUID stationId, Long sequence, java.time.Instant now, org.springframework.data.domain.Pageable pageable);
    @org.springframework.data.jpa.repository.Query("""
            select c from StationCommand c where c.stationId in :stationIds
            and (c.stationId, c.sequence) in (
                select latest.stationId, max(latest.sequence) from StationCommand latest
                where latest.stationId in :stationIds group by latest.stationId)
            order by c.stationId, c.sequence desc
            """)
    List<StationCommand> findByStationIdInOrderByStationIdAscSequenceDesc(
            @org.springframework.data.repository.query.Param("stationIds") Collection<UUID> stationIds);
    List<StationCommand> findTop50ByStationIdOrderBySequenceDesc(UUID stationId);
    long deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(java.time.Instant cutoff);
}
