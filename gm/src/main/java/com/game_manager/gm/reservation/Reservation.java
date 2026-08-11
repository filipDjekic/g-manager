package com.game_manager.gm.reservation;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "reservations")
@Getter
@Setter
@NoArgsConstructor
public class Reservation extends BaseEntity {
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "customer_id", nullable = false, length = 36)
    private UUID customerId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "employee_id", nullable = false, length = 36)
    private UUID employeeId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "service_id", nullable = false, length = 36)
    private UUID serviceId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "recurrence_series_id", length = 36)
    private UUID recurrenceSeriesId;

    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @Column(name = "end_time", nullable = false)
    private Instant endTime;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReservationStatus status;

    @Column(length = 500)
    private String note;
}
