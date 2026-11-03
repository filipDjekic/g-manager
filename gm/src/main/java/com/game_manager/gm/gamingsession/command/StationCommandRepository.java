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
    // Drive the read from the requested stations, including those without commands. The outer
    // join prevents MySQL from starting with a history scan when its row estimates are stale.
    // Each scalar lookup seeks backwards in the unique (station_id, sequence) index, LIMIT 1.
    // Include both index columns in DESC order: MySQL otherwise sorts the correlated range
    // before applying LIMIT, even though station_id is constant within that range.
    // Read retained commands, not the durable cursor: retention can remove its referenced row.
    @org.springframework.data.jpa.repository.Query("""
            select new com.game_manager.gm.gamingsession.command.StationCommandSummary(
                station.id, c.sequence, c.commandType, c.availableAt, c.acknowledgedAt)
            from PhysicalResource station left join StationCommand c on c.id = (
                select history.id from StationCommand history where history.stationId = station.id
                order by history.stationId desc, history.sequence desc limit 1
            )
            where station.id in :stationIds
            """)
    List<StationCommandSummary> findLatestSummariesByStationIdIn(
            @org.springframework.data.repository.query.Param("stationIds") Collection<UUID> stationIds);
    List<StationCommand> findTop50ByStationIdOrderBySequenceDesc(UUID stationId);
    long deleteByExpiresAtBeforeAndAcknowledgedAtIsNotNull(java.time.Instant cutoff);
}
