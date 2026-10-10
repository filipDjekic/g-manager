package com.game_manager.gm.reservation;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;

public class ReservationSummaryRepositoryImpl implements ReservationSummaryRepository {
    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public long countDistinctCustomers(Specification<Reservation> specification) {
        var builder = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> query = builder.createQuery(Long.class);
        Root<Reservation> reservation = query.from(Reservation.class);
        query.select(builder.countDistinct(reservation.get("customerId")));
        Predicate predicate = specification.toPredicate(reservation, query, builder);
        if (predicate != null) query.where(predicate);
        return entityManager.createQuery(query).getSingleResult();
    }
}
