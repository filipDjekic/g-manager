package com.game_manager.gm.customer;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerActivationTokenRepository
        extends JpaRepository<CustomerActivationToken, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from CustomerActivationToken t where t.tokenHash = :hash")
    Optional<CustomerActivationToken> findByHashForUpdate(@Param("hash") String hash);

    @Modifying
    @Query("update CustomerActivationToken t set t.consumedAt = :now "
            + "where t.userId = :userId and t.consumedAt is null")
    int consumeActiveForUser(@Param("userId") UUID userId, @Param("now") java.time.Instant now);
}
