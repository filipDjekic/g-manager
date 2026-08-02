package com.game_manager.gm.idempotency;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IdempotencyRepository extends JpaRepository<IdempotencyKey, UUID> {
    Optional<IdempotencyKey> findByKeyAndEndpoint(String key, String endpoint);
    long deleteByExpiresAtBefore(Instant cutoff);
}
