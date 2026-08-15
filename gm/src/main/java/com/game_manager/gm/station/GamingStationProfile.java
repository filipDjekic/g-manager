package com.game_manager.gm.station;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "gaming_station_profiles")
@Getter @Setter
public class GamingStationProfile extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "resource_id", nullable = false, unique = true, length = 36) private UUID resourceId;
    @Enumerated(EnumType.STRING)
    @Column(name = "operational_status", nullable = false, length = 20)
    private StationOperationalStatus operationalStatus = StationOperationalStatus.AVAILABLE;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "application_profile_id", length = 36) private UUID applicationProfileId;
    @Column(name = "client_enabled", nullable = false) private boolean clientEnabled;
    @Column(name = "heartbeat_interval_seconds", nullable = false) private int heartbeatIntervalSeconds = 10;
    @Column(name = "offline_grace_seconds", nullable = false) private int offlineGraceSeconds = 60;
    @Column(name = "last_heartbeat_at") private Instant lastHeartbeatAt;
    @Column(name = "client_version", length = 60) private String clientVersion;
}
