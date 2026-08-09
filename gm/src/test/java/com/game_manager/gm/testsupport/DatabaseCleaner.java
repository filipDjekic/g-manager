package testsupport;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

public final class DatabaseCleaner {
    private static final List<String> TABLES = List.of(
            "idempotency_keys", "audit_records", "order_items", "orders",
            "reservations", "refresh_tokens", "security_events", "users");

    private DatabaseCleaner() {
    }

    public static void clean(JdbcTemplate jdbc) {
        jdbc.execute("SET REFERENTIAL_INTEGRITY FALSE");
        try {
            TABLES.forEach(table -> jdbc.execute("TRUNCATE TABLE " + table));
        } finally {
            jdbc.execute("SET REFERENTIAL_INTEGRITY TRUE");
        }
    }
}
