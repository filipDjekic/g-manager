package com.game_manager.gm.gamingsession;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "gaming_sessions")
@Getter @Setter
public class GamingSession extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "customer_id", nullable = false, length = 36) private UUID customerId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "resource_id", nullable = false, length = 36) private UUID resourceId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "location_id", nullable = false, length = 36) private UUID locationId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "reservation_id", length = 36) private UUID reservationId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "started_by", nullable = false, length = 36) private UUID startedBy;
    @Column(name = "started_at", nullable = false) private Instant startedAt;
    @Column(name = "ends_at", nullable = false) private Instant endsAt;
    @Column(name = "ended_at") private Instant endedAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private GamingSessionStatus status;
    @Column(name = "termination_reason", length = 500) private String terminationReason;
}
