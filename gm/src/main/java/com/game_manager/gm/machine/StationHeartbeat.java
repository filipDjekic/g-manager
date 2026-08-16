package com.game_manager.gm.machine;
import jakarta.persistence.*;import java.time.Instant;import java.util.UUID;import lombok.Getter;import lombok.Setter;import org.hibernate.annotations.JdbcTypeCode;import org.hibernate.type.SqlTypes;import org.springframework.data.annotation.CreatedDate;import org.springframework.data.annotation.LastModifiedDate;import org.springframework.data.jpa.domain.support.AuditingEntityListener;
@Entity @Table(name="station_heartbeats") @EntityListeners(AuditingEntityListener.class) @Getter @Setter
public class StationHeartbeat {
 @Id @JdbcTypeCode(SqlTypes.CHAR)@Column(name="station_id",length=36)private UUID stationId;
 @JdbcTypeCode(SqlTypes.CHAR)@Column(name="identity_id",nullable=false,length=36)private UUID identityId;
 @Column(name="client_version",nullable=false,length=60)private String clientVersion;@Column(name="client_status",nullable=false,length=30)private String clientStatus;
 @Column(name="last_command_sequence",nullable=false)private Long lastCommandSequence;@Column(name="last_seen_at",nullable=false)private Instant lastSeenAt;
 @CreatedDate@Column(name="created_at",nullable=false,updatable=false)private Instant createdAt;
 @LastModifiedDate@Column(name="updated_at",nullable=false)private Instant updatedAt;@Version@Column(nullable=false)private Long version;
}
