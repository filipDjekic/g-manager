package com.game_manager.gm.workinghours;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkingHoursExceptionRepository
        extends JpaRepository<WorkingHoursException, UUID> {
    @Query("select e from WorkingHoursException e where e.locationId is null and e.date=:date")
    Optional<WorkingHoursException> findByDate(@Param("date") LocalDate date);
    Optional<WorkingHoursException> findByLocationIdAndDate(UUID locationId, LocalDate date);
    boolean existsByDate(LocalDate date);
    long countByDateGreaterThan(LocalDate date);
    org.springframework.data.domain.Page<WorkingHoursException> findByDateGreaterThanEqual(LocalDate date,org.springframework.data.domain.Pageable pageable);
    List<WorkingHoursException> findAllByDateBetweenOrderByDateAsc(LocalDate from, LocalDate to);
}
