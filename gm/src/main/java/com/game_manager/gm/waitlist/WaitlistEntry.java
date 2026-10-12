package com.game_manager.gm.waitlist;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "waitlist_entries")
@Getter @Setter @NoArgsConstructor
public class WaitlistEntry extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "customer_id", nullable = false, length = 36) private UUID customerId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "employee_id", nullable = false, length = 36) private UUID employeeId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "service_id", nullable = false, length = 36) private UUID serviceId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "location_id", length = 36) private UUID locationId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "resource_id", length = 36) private UUID resourceId;
    @Column(name = "desired_start", nullable = false) private Instant desiredStart;
    @Column(name = "desired_end") private Instant desiredEnd;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private WaitlistStatus status;
    @Column(name = "active_key", length = 280, unique = true) private String activeKey;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "area_id", length = 36) private UUID areaId;
    @Column(name = "queue_entered_at", nullable = false) private Instant queueEnteredAt;
    @Column(name = "internal_note", length = 500) private String internalNote;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name = "created_by_id", length = 36) private UUID createdById;
    @Column(name = "consent_at") private Instant consentAt;
    @Column(name = "status_changed_at") private Instant statusChangedAt;
}
