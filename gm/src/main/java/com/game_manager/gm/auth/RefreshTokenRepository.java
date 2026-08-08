package com.game_manager.gm.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

import java.time.Instant;
import java.util.List;

import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select token from RefreshToken token where token.tokenHash = :tokenHash")
    Optional<RefreshToken> findByTokenHashForUpdate(String tokenHash);

    List<RefreshToken> findAllByUserIdAndRevokedFalseAndExpiresAtAfterOrderByLastSeenAtDesc(
            UUID userId, Instant now);

    Optional<RefreshToken> findByIdAndUserId(UUID id, UUID userId);

    @Modifying
    @Query("update RefreshToken token set token.revoked = true where token.userId = :userId and token.revoked = false")
    int revokeAllByUserId(UUID userId);

    @Modifying
    @Query("update RefreshToken token set token.revoked = true where token.sessionId = :sessionId and token.revoked = false")
    int revokeAllBySessionId(UUID sessionId);
}
