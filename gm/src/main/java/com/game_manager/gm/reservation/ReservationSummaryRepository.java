package com.game_manager.gm.reservation;

import org.springframework.data.jpa.domain.Specification;

public interface ReservationSummaryRepository {
    long countDistinctCustomers(Specification<Reservation> specification);
}
