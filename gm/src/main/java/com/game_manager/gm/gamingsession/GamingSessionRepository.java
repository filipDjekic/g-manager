package com.game_manager.gm.gamingsession;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface GamingSessionRepository extends JpaRepository<GamingSession, UUID> {
    boolean existsByCustomerIdAndStatus(UUID customerId, GamingSessionStatus status);
    boolean existsByResourceIdAndStatus(UUID resourceId, GamingSessionStatus status);
    List<GamingSession> findByStatusOrderByStartedAtDesc(GamingSessionStatus status);
    List<GamingSession> findByResourceIdInAndStatus(Collection<UUID> resourceIds, GamingSessionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from GamingSession s where s.id = :id")
    Optional<GamingSession> findByIdForUpdate(@Param("id") UUID id);
}
