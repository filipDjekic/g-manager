package com.game_manager.gm.order;

import java.time.Instant;
import java.util.UUID;
import java.util.Collection;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

public interface OrderRepository
        extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {
    @Override
    @EntityGraph(attributePaths = "items")
    java.util.Optional<Order> findById(UUID id);

    @Query("""
            select new com.game_manager.gm.order.OrderRevenueTotal(
                count(o), coalesce(sum(o.totalPrice), 0))
            from Order o
            where o.status = com.game_manager.gm.order.OrderStatus.COMPLETED
              and o.createdAt >= :from and o.createdAt < :to
            """)
    OrderRevenueTotal completedRevenueBetween(
            @Param("from") Instant from, @Param("to") Instant to);

    @Query("""
            select count(o) from Order o
            where o.status = :status
              and o.createdAt >= :from and o.createdAt < :to
              and (:handledBy is null or o.handledBy = :handledBy)
            """)
    long countByStatusBetween(
            @Param("status") OrderStatus status,
            @Param("handledBy") UUID handledBy,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("""
            select new com.game_manager.gm.order.OrderAnalyticsRow(
                o.id, o.createdAt, o.status, o.totalPrice)
            from Order o where o.createdAt >= :from and o.createdAt < :to
            order by o.createdAt, o.id
            """)
    java.util.List<OrderAnalyticsRow> analyticsBetween(
            @Param("from") Instant from, @Param("to") Instant to);

    @EntityGraph(attributePaths = "items")
    @Query("""
            select o from Order o
            where o.status = :status
              and ((:unclaimed = true and o.handledBy is null)
                   or (:unclaimed = false and o.handledBy = :handledBy))
            order by o.createdAt, o.id
            """)
    java.util.List<Order> findOperational(
            @Param("status") OrderStatus status,
            @Param("handledBy") UUID handledBy,
            @Param("unclaimed") boolean unclaimed,
            Pageable pageable);

    long countByStatusAndHandledByIsNull(OrderStatus status);

    long countByStatus(OrderStatus status);

    @Query("""
            select new com.game_manager.gm.order.CustomerOrderSummary(
                o.customerId, count(o),
                sum(case when o.status = com.game_manager.gm.order.OrderStatus.COMPLETED then 1 else 0 end),
                coalesce(sum(case when o.status = com.game_manager.gm.order.OrderStatus.COMPLETED then o.totalPrice else 0 end), 0),
                max(o.createdAt))
            from Order o where o.customerId in :customerIds group by o.customerId
            """)
    java.util.List<CustomerOrderSummary> summarizeCustomers(@Param("customerIds") Collection<UUID> customerIds);

    @EntityGraph(attributePaths = "items")
    @Query("select o from Order o where o.customerId=:customerId order by o.createdAt desc,o.id desc")
    java.util.List<Order> customerHistory(@Param("customerId") UUID customerId, Pageable pageable);
}
