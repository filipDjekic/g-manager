package com.game_manager.gm.reservation;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationRepository
        extends JpaRepository<Reservation, UUID>, JpaSpecificationExecutor<Reservation> {
    @Query("""
            select r from Reservation r
            where r.employeeId = :employeeId
              and r.status not in :excludedStatuses
              and r.startTime < :endTime
              and r.endTime > :startTime
              and (:excludeId is null or r.id <> :excludeId)
            """)
    List<Reservation> findConflicting(
            @Param("employeeId") UUID employeeId,
            @Param("startTime") Instant startTime,
            @Param("endTime") Instant endTime,
            @Param("excludedStatuses") List<ReservationStatus> excludedStatuses,
            @Param("excludeId") UUID excludeId);

    @Query("""
            select new com.game_manager.gm.reservation.ReservationStatusTotal(r.status, count(r))
            from Reservation r
            where r.startTime >= :from and r.startTime < :to
            group by r.status
            """)
    List<ReservationStatusTotal> countByStatusBetween(
            @Param("from") Instant from, @Param("to") Instant to);

    @Query("""
            select count(r) from Reservation r
            where r.employeeId = :employeeId
              and r.status = :status
              and r.startTime >= :from and r.startTime < :to
            """)
    long countForEmployeeAndStatusBetween(
            @Param("employeeId") UUID employeeId,
            @Param("status") ReservationStatus status,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("""
            select new com.game_manager.gm.reservation.ReservationAnalyticsRow(
                r.id, r.employeeId, r.startTime, r.endTime, r.status)
            from Reservation r
            where r.startTime >= :from and r.startTime < :to
              and (:employeeId is null or r.employeeId = :employeeId)
            order by r.startTime, r.id
            """)
    List<ReservationAnalyticsRow> analyticsBetween(
            @Param("from") Instant from, @Param("to") Instant to,
            @Param("employeeId") UUID employeeId);
}
