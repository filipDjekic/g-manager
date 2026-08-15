package com.game_manager.gm.workinghours;

import java.time.DayOfWeek;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkingHoursRepository extends JpaRepository<WorkingHours, UUID> {
    @Query("select h from WorkingHours h where h.locationId is null and h.dayOfWeek=:day")
    Optional<WorkingHours> findByDayOfWeek(@Param("day") DayOfWeek dayOfWeek);
    Optional<WorkingHours> findByLocationIdAndDayOfWeek(UUID locationId, DayOfWeek dayOfWeek);
    List<WorkingHours> findByLocationIdOrderByDayOfWeek(UUID locationId);
}
