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
    @Column(name = "active_key", length = 180, unique = true) private String activeKey;
}
