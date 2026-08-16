package com.game_manager.gm.gamingsession;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import java.time.Instant;

public interface GamingSessionRepository extends JpaRepository<GamingSession, UUID> {
    boolean existsByCustomerIdAndStatus(UUID customerId, GamingSessionStatus status);
    boolean existsByResourceIdAndStatus(UUID resourceId, GamingSessionStatus status);
    Optional<GamingSession> findByResourceIdAndStatus(UUID resourceId, GamingSessionStatus status);
    List<GamingSession> findByStatusOrderByStartedAtDesc(GamingSessionStatus status);
    List<GamingSession> findByResourceIdInAndStatus(Collection<UUID> resourceIds, GamingSessionStatus status);

    @Query("select s from GamingSession s where s.resourceId in :resourceIds order by s.resourceId, s.startedAt desc")
    List<GamingSession> findLatestCandidates(@Param("resourceIds") Collection<UUID> resourceIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from GamingSession s where s.id = :id")
    Optional<GamingSession> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from GamingSession s where s.status = :status and s.endsAt <= :now order by s.endsAt")
    List<GamingSession> findDueForUpdate(@Param("status") GamingSessionStatus status,
            @Param("now") Instant now, Pageable pageable);

    @Query("select s from GamingSession s order by s.updatedAt")
    List<GamingSession> findForReconciliation(Pageable pageable);
}
