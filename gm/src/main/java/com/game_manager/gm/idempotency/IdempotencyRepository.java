package com.game_manager.gm.idempotency;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface IdempotencyRepository extends JpaRepository<IdempotencyKey, UUID> {
    Optional<IdempotencyKey> findByPrincipalIdAndKeyAndEndpoint(
            UUID principalId, String key, String endpoint);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select item from IdempotencyKey item where item.principalId = :principalId and item.key = :key and item.endpoint = :endpoint")
    Optional<IdempotencyKey> findScopedForUpdate(@Param("principalId") UUID principalId,
            @Param("key") String key, @Param("endpoint") String endpoint);

    @Modifying
    @Query("delete from IdempotencyKey item where item.status = com.game_manager.gm.idempotency.IdempotencyStatus.COMPLETED and item.expiresAt < :cutoff")
    long deleteCompletedByExpiresAtBefore(@Param("cutoff") Instant cutoff);
}
