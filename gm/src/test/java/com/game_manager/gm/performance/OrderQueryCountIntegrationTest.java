package com.game_manager.gm.performance;

import static org.assertj.core.api.Assertions.assertThat;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
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
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import testsupport.DatabaseCleaner;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@ActiveProfiles("test")
class OrderQueryCountIntegrationTest {
    @Autowired private OrderRepository orderRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CatalogRepository catalogRepository;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        DatabaseCleaner.clean(jdbc);
    }

    @Test
    @Transactional
    void pagedOrderItemsUseBoundedBatchQueriesOnLargeDataset() {
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
        for (int index = 0; index < 60; index++) {
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

        Statistics statistics = entityManager.getEntityManagerFactory()
                .unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        var page = orderRepository.findAll(
                (root, query, builder) -> builder.equal(root.get("customerId"), customer.getId()),
                PageRequest.of(0, 60, Sort.by("createdAt").descending()));
        assertThat(page.getContent()).hasSize(60);
        assertThat(page.getContent()).allSatisfy(order -> assertThat(order.getItems()).hasSize(1));

        assertThat(statistics.getPrepareStatementCount()).isLessThanOrEqualTo(4);
    }
}
