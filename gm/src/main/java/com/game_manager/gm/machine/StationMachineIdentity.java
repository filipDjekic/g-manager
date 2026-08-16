package com.game_manager.gm.machine;
import com.game_manager.gm.common.entity.BaseEntity;import jakarta.persistence.*;import java.time.Instant;import java.util.UUID;import lombok.Getter;import lombok.Setter;import org.hibernate.annotations.JdbcTypeCode;import org.hibernate.type.SqlTypes;
@Entity @Table(name="station_machine_identities") @Getter @Setter
public class StationMachineIdentity extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="station_id",nullable=false,length=36)private UUID stationId;
 @Column(name="public_key_base64",nullable=false,columnDefinition="TEXT")private String publicKeyBase64;
 @Column(name="public_key_fingerprint",nullable=false,length=64,unique=true)private String publicKeyFingerprint;
 @Column(name="key_version",nullable=false)private Long keyVersion;
 @Enumerated(EnumType.STRING)@Column(nullable=false,length=20)private MachineIdentityStatus status;
 @Column(name="enrolled_at",nullable=false)private Instant enrolledAt;@Column(name="overlap_expires_at")private Instant overlapExpiresAt;
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="enrolled_by",nullable=false,length=36)private UUID enrolledBy;
 @Column(name="revoked_at")private Instant revokedAt;@Column(name="last_authenticated_at")private Instant lastAuthenticatedAt;
}
