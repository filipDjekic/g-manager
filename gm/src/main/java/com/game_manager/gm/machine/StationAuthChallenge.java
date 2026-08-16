package com.game_manager.gm.machine;
import com.game_manager.gm.common.entity.BaseEntity;import jakarta.persistence.*;import java.time.Instant;import java.util.UUID;import lombok.Getter;import lombok.Setter;import org.hibernate.annotations.JdbcTypeCode;import org.hibernate.type.SqlTypes;
@Entity @Table(name="station_auth_challenges") @Getter @Setter
public class StationAuthChallenge extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="identity_id",nullable=false,length=36)private UUID identityId;
 @Column(name="nonce_hash",nullable=false,length=64,unique=true)private String nonceHash;
 @Column(name="expires_at",nullable=false)private Instant expiresAt;@Column(name="consumed_at")private Instant consumedAt;
}
