package com.game_manager.gm.reservation;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name="reservation_recurrence_series") @Getter @Setter @NoArgsConstructor
public class RecurrenceSeries extends BaseEntity {
 @JdbcTypeCode(SqlTypes.CHAR) @Column(name="customer_id",nullable=false,length=36) private UUID customerId;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) private RecurrenceFrequency frequency;
 @Column(name="interval_value",nullable=false) private int intervalValue;
 @Column(name="requested_occurrences",nullable=false) private int requestedOccurrences;
 @Enumerated(EnumType.STRING) @Column(name="conflict_policy",nullable=false,length=30) private RecurrenceConflictPolicy conflictPolicy;
}
