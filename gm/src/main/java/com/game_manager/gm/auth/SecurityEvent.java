package com.game_manager.gm.auth;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

@Entity
@Table(name = "security_events")
public class SecurityEvent extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "user_id", length = 36)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "session_id", length = 36)
    private UUID sessionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40)
    private SecurityEventType eventType;

    @Column(name = "device_label", nullable = false, length = 100)
    private String deviceLabel;

    @Column(name = "ip_hash", nullable = false, length = 64)
    private String ipHash;

    protected SecurityEvent() {}

    public SecurityEvent(UUID userId, UUID sessionId, SecurityEventType eventType,
                         String deviceLabel, String ipHash) {
        this.userId = userId;
        this.sessionId = sessionId;
        this.eventType = eventType;
        this.deviceLabel = deviceLabel;
        this.ipHash = ipHash;
    }

    public UUID getUserId() { return userId; }
    public UUID getSessionId() { return sessionId; }
    public SecurityEventType getEventType() { return eventType; }
    public String getDeviceLabel() { return deviceLabel; }
}
