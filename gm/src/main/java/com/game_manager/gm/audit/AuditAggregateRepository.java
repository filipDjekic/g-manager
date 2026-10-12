package com.game_manager.gm.audit;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
@RequiredArgsConstructor
class AuditAggregateRepository {
    private final EntityManager entityManager;

    List<ActionCount> countByAction(Specification<AuditEvent> specification) {
        var builder = entityManager.getCriteriaBuilder();
        var query = builder.createTupleQuery();
        var root = query.from(AuditEvent.class);
        query.multiselect(root.get("action"), builder.count(root));
        var predicate = specification.toPredicate(root, query, builder);
        if (predicate != null) query.where(predicate);
        query.groupBy(root.get("action"));
        return entityManager.createQuery(query).getResultList().stream()
                .map(row -> new ActionCount(row.get(0, String.class), row.get(1, Long.class))).toList();
    }

    record ActionCount(String action, long count) {}
}
