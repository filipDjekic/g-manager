package com.game_manager.gm.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class JobConcurrencyIT {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("gmanager_jobs")
            .withUsername("gmanager_it")
            .withPassword("ephemeral-test-password");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Autowired JobService service;
    @Autowired JobStore store;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void twoMySqlRunnersClaimDifferentJobsAndExpiredLeaseIsReclaimed() throws Exception {
        service.enqueue("mysql-test", Map.of(), null);
        service.enqueue("mysql-test", Map.of(), null);
        Instant now = Instant.now().plusSeconds(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<List<JobRecord>> first = executor.submit(() -> claim(start, "mysql-a", now));
            Future<List<JobRecord>> second = executor.submit(() -> claim(start, "mysql-b", now));
            start.countDown();
            List<JobRecord> claimed = new ArrayList<>(first.get());
            claimed.addAll(second.get());

            assertThat(claimed).hasSize(2);
            assertThat(claimed).extracting(JobRecord::id).doesNotHaveDuplicates();
        }

        JobRecord expired = transaction().execute(status -> store.claim(
                "mysql-recovery", 1, now.plusSeconds(11), Duration.ofSeconds(10)).getFirst());
        assertThat(expired.attempt()).isEqualTo(2);
    }

    private List<JobRecord> claim(CountDownLatch start, String worker, Instant now)
            throws InterruptedException {
        start.await();
        return transaction().execute(status ->
                store.claim(worker, 1, now, Duration.ofSeconds(10)));
    }

    private TransactionTemplate transaction() {
        return new TransactionTemplate(transactionManager);
    }
}
