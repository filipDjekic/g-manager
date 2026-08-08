package com.game_manager.gm.audit;

import com.game_manager.gm.common.entity.BaseEntity;
import com.game_manager.gm.common.security.Role;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.UUID;

@Entity
@Table(name = "audit_events")
public class AuditEvent extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "actor_id", nullable = false, length = 36, updatable = false)
    private UUID actorId;
    @Enumerated(EnumType.STRING)
    @Column(name = "actor_role", nullable = false, length = 20, updatable = false)
    private Role actorRole;
    @Column(nullable = false, length = 80, updatable = false)
    private String action;
    @Column(name = "resource_type", nullable = false, length = 80, updatable = false)
    private String resourceType;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "resource_id", nullable = false, length = 36, updatable = false)
    private UUID resourceId;
    @Column(name = "before_data", columnDefinition = "TEXT", updatable = false)
    private String beforeData;
    @Column(name = "after_data", columnDefinition = "TEXT", updatable = false)
    private String afterData;
    @Column(length = 500, updatable = false)
    private String reason;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, updatable = false)
    private AuditVisibility visibility;

    protected AuditEvent() {}

    public AuditEvent(UUID actorId, Role actorRole, String action, String resourceType,
                      UUID resourceId, String beforeData, String afterData, String reason,
                      AuditVisibility visibility) {
        this.actorId = actorId; this.actorRole = actorRole; this.action = action;
        this.resourceType = resourceType; this.resourceId = resourceId;
        this.beforeData = beforeData; this.afterData = afterData; this.reason = reason;
        this.visibility = visibility;
    }

    public UUID getActorId() { return actorId; }
    public Role getActorRole() { return actorRole; }
    public String getAction() { return action; }
    public String getResourceType() { return resourceType; }
    public UUID getResourceId() { return resourceId; }
    public String getBeforeData() { return beforeData; }
    public String getAfterData() { return afterData; }
    public String getReason() { return reason; }
    public AuditVisibility getVisibility() { return visibility; }
}
