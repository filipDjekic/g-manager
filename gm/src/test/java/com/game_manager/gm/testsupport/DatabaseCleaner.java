package testsupport;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

public final class DatabaseCleaner {
    private static final List<String> TABLES = List.of(
            "outbox_consumer_receipts", "outbox_events",
            "background_job_attempts", "background_jobs",
            "idempotency_keys", "audit_events", "notification_delivery_attempts",
            "notifications", "notification_preferences", "order_items", "orders",
            "customer_crm_profile_tags", "customer_crm_notes", "customer_crm_profiles", "customer_crm_tags",
            "waitlist_offers", "waitlist_entries", "employee_time_off",
            "reservations", "reservation_recurrence_series",
            "customer_activation_tokens", "gaming_station_profiles", "application_profile_entries",
            "application_profiles", "application_definitions",
            "user_location_assignments", "physical_resources", "areas", "locations",
            "refresh_tokens", "security_events", "users");

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
