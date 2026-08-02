package com.game_manager.gm.workinghours;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkingHoursExceptionRepository
        extends JpaRepository<WorkingHoursException, UUID> {
    Optional<WorkingHoursException> findByDate(LocalDate date);
    boolean existsByDate(LocalDate date);
    List<WorkingHoursException> findAllByDateGreaterThanEqualOrderByDateAsc(LocalDate date);
}
