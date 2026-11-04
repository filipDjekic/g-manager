package com.game_manager.gm.gamingsession.command;
import java.time.Instant;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
    interface HistoryRow {
        Instant getOccurredAt(); String getCategory(); String getAction(); String getStatus();
        Long getCommandSequence(); String getCorrelationId(); String getDetails();
    }
    @Query(value="""
        SELECT occurredAt,category,action,status,commandSequence,correlationId,details FROM (
          SELECT occurred_at AS occurredAt,'ENFORCEMENT' AS category,action,resulting_status AS status,
                 command_sequence AS commandSequence,NULL AS correlationId,details,id
          FROM station_reconciliation_audit WHERE station_id=:stationId
          UNION ALL
          SELECT available_at AS occurredAt,'COMMAND' AS category,command_type AS action,
                 CASE WHEN acknowledged_at IS NULL THEN 'PENDING' ELSE 'ACKNOWLEDGED' END AS status,
                 sequence AS commandSequence,correlation_id AS correlationId,NULL AS details,id
          FROM station_commands WHERE station_id=:stationId
        ) history ORDER BY occurredAt DESC,category DESC,id DESC
        """, countQuery="""
        SELECT (SELECT COUNT(*) FROM station_reconciliation_audit WHERE station_id=:stationId)
             + (SELECT COUNT(*) FROM station_commands WHERE station_id=:stationId)
        """, nativeQuery=true)
    org.springframework.data.domain.Page<HistoryRow> historyPage(@Param("stationId") String stationId,org.springframework.data.domain.Pageable pageable);
}
