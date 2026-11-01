package com.game_manager.gm.customer;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

class CustomerActivationMigrationTest {
    @Test
    void revokesLegacyCodesWithoutExtendingExpiredRetentionOrChangingConsumedHistory() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:activation-migration-" + UUID.randomUUID()
                + ";MODE=MySQL;INIT=SET TIME ZONE 'UTC'", "sa", "");
        // Keep this isolated database alive while JDBC helpers open their own connections.
        try (var connection = source.getConnection()) {
            var jdbc = new JdbcTemplate(source);
            jdbc.execute("create table customer_activation_tokens (id int primary key, "
                    + "expires_at timestamp(6) not null, consumed_at timestamp(6) null)");
            Instant before = Instant.now().truncatedTo(ChronoUnit.MICROS);
            Instant future = before.plus(Duration.ofDays(1)), expired = before.minus(Duration.ofDays(8));
            Instant used = before.minus(Duration.ofDays(1));
            jdbc.update("insert into customer_activation_tokens values (1, ?, null), (2, ?, null), (3, ?, ?)",
                    Timestamp.from(future), Timestamp.from(expired), Timestamp.from(future), Timestamp.from(used));

            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V42__secure_short_customer_activation.sql"));

            assertThat(jdbc.queryForObject("select expires_at from customer_activation_tokens where id = 1", Timestamp.class).toInstant())
                    .isBetween(before, Instant.now().plusSeconds(1));
            assertThat(jdbc.queryForObject("select consumed_at from customer_activation_tokens where id = 1", Timestamp.class)).isNull();
            assertThat(jdbc.queryForObject("select expires_at from customer_activation_tokens where id = 2", Timestamp.class).toInstant())
                    .isEqualTo(expired);
            assertThat(jdbc.queryForObject("select expires_at from customer_activation_tokens where id = 3", Timestamp.class).toInstant())
                    .isEqualTo(future);
            assertThat(jdbc.queryForObject("select consumed_at from customer_activation_tokens where id = 3", Timestamp.class).toInstant())
                    .isEqualTo(used);
            assertThat(jdbc.queryForList("select guard_key from customer_activation_guards", String.class))
                    .containsExactlyInAnyOrder("global", "generation");
        }
    }
}
