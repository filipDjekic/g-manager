package com.game_manager.gm.feature;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "feature_flag_overrides")
@Getter
@Setter
@NoArgsConstructor
public class FeatureFlagOverride extends BaseEntity {
    @Column(name = "flag_key", nullable = false, unique = true, length = 60)
    private String flagKey;
    @Column(nullable = false)
    private boolean enabled;
    @Column(name = "rollout_percentage", nullable = false)
    private int rolloutPercentage;
    @Column(name = "expires_at")
    private Instant expiresAt;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "updated_by", nullable = false, length = 36)
    private UUID updatedBy;
    @Column(nullable = false, length = 500)
    private String reason;
}
