package com.game_manager.gm.timeoff;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name="employee_time_off") @Getter @Setter @NoArgsConstructor
public class EmployeeTimeOff extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name="employee_id",nullable=false,length=36) private UUID employeeId;
    @Column(name="starts_at",nullable=false) private Instant startsAt;
    @Column(name="ends_at",nullable=false) private Instant endsAt;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) private TimeOffStatus status;
    @Column(nullable=false,length=500) private String reason;
    @Column(name="decision_reason",length=500) private String decisionReason;
}
