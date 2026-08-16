package com.game_manager.gm.machine;
import com.game_manager.gm.common.entity.BaseEntity;import jakarta.persistence.*;import java.time.Instant;import java.util.UUID;import lombok.Getter;import lombok.Setter;import org.hibernate.annotations.JdbcTypeCode;import org.hibernate.type.SqlTypes;
@Entity @Table(name="station_session_login_attempts") @Getter @Setter
public class StationSessionLoginAttempt extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="identity_id",nullable=false,length=36)private UUID identityId;
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="station_id",nullable=false,length=36)private UUID stationId;
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="session_id",length=36)private UUID sessionId;
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="customer_id",length=36)private UUID customerId;
 @Column(name="identifier_hash",nullable=false,length=64)private String identifierHash;
 @Enumerated(EnumType.STRING)@Column(nullable=false,length=30)private StationSessionLoginOutcome outcome;
 @Column(name="occurred_at",nullable=false)private Instant occurredAt;
}
