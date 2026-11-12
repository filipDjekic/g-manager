package com.game_manager.gm.performance;

import static org.assertj.core.api.Assertions.assertThat;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.gamingsession.GamingSessionRepository;
import com.game_manager.gm.gamingsession.GamingSessionStatus;
import com.game_manager.gm.order.Order;
import com.game_manager.gm.order.OrderItem;
import com.game_manager.gm.order.OrderRepository;
import com.game_manager.gm.order.OrderStatus;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.hibernate.Session;
import org.hibernate.SessionEventListener;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import testsupport.DatabaseCleaner;

@SpringBootTest(properties =
        "spring.jpa.properties.hibernate.query.fail_on_pagination_over_collection_fetch=true")
@ActiveProfiles("test")
class OrderQueryCountIntegrationTest {
    @Autowired private OrderRepository orderRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CatalogRepository catalogRepository;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private GamingSessionRepository gamingSessions;

    @BeforeEach
    void cleanDatabase() {
        DatabaseCleaner.clean(jdbc);
    }

    @ParameterizedTest
    @CsvSource({"0,60", "1,60", "0,100"})
    @Transactional
    void pagedOrderItemsUseBoundedBatchQueriesOnLargeDataset(int pageNumber, int pageSize) {
        assertThat(entityManager.getEntityManagerFactory().getProperties()
                .get("jakarta.persistence.query.timeout").toString()).isEqualTo("5000");
        User customer = userRepository.save(new User(
                "Performance Customer", "performance@example.test", "unused", Role.CUSTOMER,
                true, null));
        CatalogItem product = new CatalogItem();
        product.setName("Performance Product");
        product.setType(ItemType.PRODUCT);
        product.setPrice(new BigDecimal("100.00"));
        product.setActive(true);
        product = catalogRepository.save(product);

        List<Order> orders = new ArrayList<>();
        int totalOrders = pageSize * 2 + 1;
        for (int index = 0; index < totalOrders; index++) {
            Order order = new Order();
            order.setCustomerId(customer.getId());
            order.setStatus(OrderStatus.CREATED);
            order.setTotalPrice(product.getPrice());
            OrderItem item = new OrderItem();
            item.setProductId(product.getId());
            item.setQuantity(1);
            item.setUnitPrice(product.getPrice());
            item.setLineTotal(product.getPrice());
            order.addItem(item);
            orders.add(order);
        }
        orderRepository.saveAllAndFlush(orders);
        entityManager.clear();

        Session session = entityManager.unwrap(Session.class);
        PreparedStatementCounter counter = new PreparedStatementCounter();
        session.addEventListeners(counter);

        // Reproduce scheduled SQL on a separate session inside the measurement window.
        // Factory statistics include it; the order operation's session must not.
        CompletableFuture.runAsync(() ->
                gamingSessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE)).join();
        assertThat(counter.count).isZero();

        var page = orderRepository.findAll(
                (root, query, builder) -> builder.equal(root.get("customerId"), customer.getId()),
                PageRequest.of(pageNumber, pageSize, Sort.by("createdAt").descending().and(Sort.by("id"))));
        assertThat(page.getContent()).hasSize(pageSize);
        assertThat(page.getTotalElements()).isEqualTo(totalOrders);
        assertThat(page.getTotalPages()).isEqualTo(3);
        // Only the requested page is managed: pagination must happen in the database.
        assertThat(session.getStatistics().getEntityCount()).isEqualTo(pageSize);
        assertThat(counter.count).as("page SELECT plus COUNT").isEqualTo(2);
        assertThat(page.getContent()).allSatisfy(order -> assertThat(order.getItems()).hasSize(1));

        assertThat(counter.count)
                .as("page SELECT, COUNT and at most two item batches")
                .isLessThanOrEqualTo(4);
    }

    private static final class PreparedStatementCounter implements SessionEventListener {
        private long count;

        @Override
        public void jdbcPrepareStatementStart() {
            count++;
        }
    }
}
