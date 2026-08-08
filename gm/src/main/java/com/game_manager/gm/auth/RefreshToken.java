package com.game_manager.gm.auth;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "user_id", nullable = false, length = 36)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "session_id", nullable = false, length = 36)
    private UUID sessionId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private boolean revoked;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "replaced_by_token_id", length = 36)
    private UUID replacedByTokenId;

    @Column(name = "device_label", nullable = false, length = 100)
    private String deviceLabel;

    @Column(name = "user_agent_summary", nullable = false, length = 160)
    private String userAgentSummary;

    @Column(name = "ip_hash", nullable = false, length = 64)
    private String ipHash;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected RefreshToken() {
    }

    public RefreshToken(
            UUID userId,
            UUID sessionId,
            String tokenHash,
            Instant expiresAt,
            String deviceLabel,
            String userAgentSummary,
            String ipHash,
            Instant lastSeenAt
    ) {
        this.userId = userId;
        this.sessionId = sessionId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.deviceLabel = deviceLabel;
        this.userAgentSummary = userAgentSummary;
        this.ipHash = ipHash;
        this.lastSeenAt = lastSeenAt;
    }

    public UUID getUserId() { return userId; }
    public UUID getSessionId() { return sessionId; }
    public String getTokenHash() { return tokenHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public boolean isRevoked() { return revoked; }
    public UUID getReplacedByTokenId() { return replacedByTokenId; }
    public String getDeviceLabel() { return deviceLabel; }
    public String getUserAgentSummary() { return userAgentSummary; }
    public String getIpHash() { return ipHash; }
    public Instant getLastSeenAt() { return lastSeenAt; }

    public void revoke(UUID replacementId) {
        this.revoked = true;
        this.replacedByTokenId = replacementId;
    }

}
