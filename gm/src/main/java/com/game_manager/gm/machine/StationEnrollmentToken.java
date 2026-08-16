package com.game_manager.gm.machine;
import com.game_manager.gm.common.entity.BaseEntity;import jakarta.persistence.*;import java.time.Instant;import java.util.UUID;import lombok.Getter;import lombok.Setter;import org.hibernate.annotations.JdbcTypeCode;import org.hibernate.type.SqlTypes;
@Entity @Table(name="station_enrollment_tokens") @Getter @Setter
public class StationEnrollmentToken extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="station_id",nullable=false,length=36)private UUID stationId;
 @Column(name="token_hash",nullable=false,length=64,unique=true)private String tokenHash;
 @Enumerated(EnumType.STRING)@Column(nullable=false,length=20)private EnrollmentPurpose purpose;
 @Enumerated(EnumType.STRING)@Column(nullable=false,length=20)private EnrollmentTokenStatus status;
 @Column(name="expires_at",nullable=false)private Instant expiresAt;@Column(name="consumed_at")private Instant consumedAt;
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="created_by",nullable=false,length=36)private UUID createdBy;
}
