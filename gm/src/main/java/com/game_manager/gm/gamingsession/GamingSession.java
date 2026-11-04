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
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "customer_id", length = 36) private UUID customerId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "resource_id", nullable = false, length = 36) private UUID resourceId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "location_id", nullable = false, length = 36) private UUID locationId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "reservation_id", length = 36) private UUID reservationId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "started_by", nullable = false, length = 36) private UUID startedBy;
    @Enumerated(EnumType.STRING) @Column(name="billing_mode",nullable=false) private GamingBillingMode billingMode = GamingBillingMode.FIXED_DURATION;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name="metered_tariff_id",length=36) private UUID meteredTariffId;
    @Column(name="metered_price",precision=14,scale=2) private java.math.BigDecimal meteredPrice;
    @Column(name="metered_tariff_seconds") private Long meteredTariffSeconds;
    @Column(name="billing_unit_seconds") private Integer billingUnitSeconds;
    @Column(name="billed_seconds",nullable=false) private long billedSeconds;
    @Column(name="charged_amount",nullable=false,precision=14,scale=2) private java.math.BigDecimal chargedAmount = new java.math.BigDecimal("0.00");
    @Column(name="last_billed_at") private Instant lastBilledAt;
    @Column(name="metered_lease_until") private Instant meteredLeaseUntil;
    @Column(name="legacy_minutes",nullable=false) private int legacyMinutes;
    @Column(name="guest_name",length=120) private String guestName;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name="move_target_id",length=36) private UUID moveTargetId;
    @Column(name="move_remaining_seconds") private Long moveRemainingSeconds;
    @Column(name = "started_at", nullable = false) private Instant startedAt;
    @Column(name = "ends_at", nullable = false) private Instant endsAt;
    @Column(name = "ended_at") private Instant endedAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private GamingSessionStatus status;
    @Column(name = "termination_reason", length = 500) private String terminationReason;
    @Column(name = "last_command_sequence") private Long lastCommandSequence;
}
