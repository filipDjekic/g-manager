package com.game_manager.gm.idempotency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(
        name = "idempotency_keys",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_idempotency_principal_key_endpoint",
                columnNames = {"principal_id", "idempotency_key", "endpoint"}))
@Getter
@Setter
@NoArgsConstructor
public class IdempotencyKey {
    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(nullable = false, length = 36)
    private UUID id;

    @Column(name = "idempotency_key", nullable = false, length = 255)
    private String key;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "principal_id", nullable = false, length = 36)
    private UUID principalId;

    @Column(nullable = false, length = 255)
    private String endpoint;

    @Column(name = "request_hash", nullable = false, length = 64, columnDefinition = "CHAR(64)")
    private String requestHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private IdempotencyStatus status;

    @Column(name = "response_status")
    private Integer responseStatus;

    @Column(name = "response_body", columnDefinition = "LONGTEXT")
    private String responseBody;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "processing_token", nullable = false, length = 36)
    private UUID processingToken;

    @Column(name = "lease_expires_at", nullable = false)
    private Instant leaseExpiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
