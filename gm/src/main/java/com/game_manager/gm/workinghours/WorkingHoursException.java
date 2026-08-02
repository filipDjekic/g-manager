package com.game_manager.gm.workinghours;

import com.game_manager.gm.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "working_hours_exceptions")
@Getter
@Setter
@NoArgsConstructor
public class WorkingHoursException extends BaseEntity {
    @Column(name = "exception_date", nullable = false, unique = true)
    private LocalDate date;

    @Column(length = 500)
    private String description;

    @Column(name = "full_day_closed", nullable = false)
    private boolean fullDayClosed;

    @Column(name = "override_open_time")
    private LocalTime overrideOpenTime;

    @Column(name = "override_close_time")
    private LocalTime overrideCloseTime;
}
