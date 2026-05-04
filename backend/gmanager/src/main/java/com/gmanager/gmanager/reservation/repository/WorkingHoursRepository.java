package com.gmanager.gmanager.reservation.repository;

import com.gmanager.gmanager.reservation.domain.WorkingHours;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WorkingHoursRepository extends JpaRepository<WorkingHours, Long> {

    Optional<WorkingHours> findByDayOfWeek(Integer dayOfWeek);
}