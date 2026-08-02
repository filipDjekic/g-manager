package com.game_manager.gm.workinghours;

import java.time.DayOfWeek;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkingHoursRepository extends JpaRepository<WorkingHours, UUID> {
    Optional<WorkingHours> findByDayOfWeek(DayOfWeek dayOfWeek);
}
