package com.gmanager.gmanager.reservation.repository;

import com.gmanager.gmanager.reservation.domain.Reservation;
import com.gmanager.gmanager.reservation.domain.ReservationStatus;
import com.gmanager.gmanager.user.domain.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.Collection;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    Page<Reservation> findByCustomer(User customer, Pageable pageable);

    Page<Reservation> findByEmployee(User employee, Pageable pageable);

    Page<Reservation> findByStatus(ReservationStatus status, Pageable pageable);

    @Query("""
            select count(r) > 0
            from Reservation r
            where r.employee.id = :employeeId
              and r.status in :blockingStatuses
              and r.startTime < :endTime
              and r.endTime > :startTime
            """)
    boolean existsEmployeeOverlap(
            Long employeeId,
            Instant startTime,
            Instant endTime,
            Collection<ReservationStatus> blockingStatuses
    );
}