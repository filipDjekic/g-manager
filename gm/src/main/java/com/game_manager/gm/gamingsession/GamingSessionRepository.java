package com.game_manager.gm.gamingsession;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import java.time.Instant;

public interface GamingSessionRepository extends JpaRepository<GamingSession, UUID> {
    boolean existsByMoveTargetIdAndStatus(UUID moveTargetId,GamingSessionStatus status);
    Optional<GamingSession> findByCustomerIdAndStatus(UUID customerId, GamingSessionStatus status);
    boolean existsByCustomerIdAndStatus(UUID customerId, GamingSessionStatus status);
    boolean existsByResourceIdAndStatus(UUID resourceId, GamingSessionStatus status);
    Optional<GamingSession> findByResourceIdAndStatus(UUID resourceId, GamingSessionStatus status);
    List<GamingSession> findByStatusOrderByStartedAtDesc(GamingSessionStatus status);
    List<GamingSession> findByMoveTargetIdInAndStatus(Collection<UUID> resourceIds, GamingSessionStatus status);
    List<GamingSession> findByResourceIdInAndStatus(Collection<UUID> resourceIds, GamingSessionStatus status);

    @Query("""
            select new com.game_manager.gm.gamingsession.dto.GamingSessionVisitResponse(
                s.id, s.resourceId, r.name, s.locationId, s.startedAt, s.endsAt, s.endedAt, s.status, :now, s.billingMode, s.billedSeconds)
            from GamingSession s join com.game_manager.gm.resource.PhysicalResource r on r.id = s.resourceId
            where s.status = com.game_manager.gm.gamingsession.GamingSessionStatus.ACTIVE and s.customerId = :customerId and (:allLocations = true or s.resourceId in :locationIds)
            order by s.startedAt desc, s.id desc
            """)
    List<com.game_manager.gm.gamingsession.dto.GamingSessionVisitResponse> customerVisits(
            @Param("customerId") UUID customerId, @Param("allLocations") boolean allLocations,
            @Param("locationIds") Collection<UUID> locationIds, @Param("now") Instant now, Pageable pageable);

    @Query("""
            select new com.game_manager.gm.gamingsession.dto.GamingSessionVisitResponse(
                s.id, s.resourceId, r.name, s.locationId, s.startedAt, s.endsAt, s.endedAt, s.status, :now, s.billingMode, s.billedSeconds)
            from GamingSession s join com.game_manager.gm.resource.PhysicalResource r on r.id = s.resourceId
            where s.status <> com.game_manager.gm.gamingsession.GamingSessionStatus.ACTIVE and s.customerId = :customerId and (:allLocations = true or s.resourceId in :locationIds)
            order by s.startedAt desc, s.id desc
            """)
    org.springframework.data.domain.Page<com.game_manager.gm.gamingsession.dto.GamingSessionVisitResponse> visitPage(
            @Param("customerId") UUID customerId, @Param("allLocations") boolean allLocations,
            @Param("locationIds") Collection<UUID> locationIds, @Param("now") Instant now, Pageable pageable);

    @Query("""
            select s from GamingSession s where s.resourceId in :resourceIds
            and not exists (select newer.id from GamingSession newer
                where newer.resourceId = s.resourceId and newer.startedAt > s.startedAt)
            order by s.resourceId, s.startedAt desc
            """)
    List<GamingSession> findLatestCandidates(@Param("resourceIds") Collection<UUID> resourceIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from GamingSession s where s.id = :id")
    Optional<GamingSession> findByIdForUpdate(@Param("id") UUID id);

    @Query("select s from GamingSession s order by s.updatedAt")
    List<GamingSession> findForReconciliation(Pageable pageable);

    @Query("""
            select s.id from GamingSession s
            where (s.status = com.game_manager.gm.gamingsession.GamingSessionStatus.ACTIVE
                or s.endedAt is null or s.endedAt >= :cutoff)
                and (:afterId is null or s.id > :afterId)
            order by s.id
            """)
    List<UUID> findReconciliationIds(@Param("cutoff") Instant cutoff,
            @Param("afterId") UUID afterId, Pageable pageable);
}
