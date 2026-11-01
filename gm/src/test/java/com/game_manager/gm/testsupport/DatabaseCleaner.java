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
            "waitlist_events", "waitlist_offers", "waitlist_entries", "employee_time_off",
            "station_reconciliation_audit", "station_client_enforcement", "station_session_login_attempts", "station_heartbeats", "station_auth_challenges", "station_commands", "gaming_sessions", "reservations", "reservation_recurrence_series",
            "station_enrollment_tokens", "station_machine_identities", "customer_activation_tokens", "station_command_sequences", "gaming_station_profiles", "application_profile_entries",
            "application_profiles", "application_definitions",
            "user_resource_assignments", "user_location_assignments", "location_floor_plans", "physical_resources", "areas", "locations",
            "refresh_tokens", "security_events", "users");

    private DatabaseCleaner() {
    }

    public static void clean(JdbcTemplate jdbc) {
        boolean mysql = Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)
                connection -> "MySQL".equals(connection.getMetaData().getDatabaseProductName())));
        if (mysql) {
            // FOREIGN_KEY_CHECKS is connection-scoped: keep reset and truncation on one test connection.
            jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
                try (var statement = connection.createStatement()) {
                    statement.execute("SET FOREIGN_KEY_CHECKS=0");
                    boolean autoCommit = connection.getAutoCommit();
                    try {
                        if (autoCommit) connection.setAutoCommit(false);
                        for (String table : TABLES) statement.executeUpdate("DELETE FROM " + table);
                        if (autoCommit) connection.commit();
                    } catch (java.sql.SQLException exception) {
                        if (autoCommit) connection.rollback();
                        throw exception;
                    } finally {
                        if (autoCommit) connection.setAutoCommit(true);
                        statement.execute("SET FOREIGN_KEY_CHECKS=1");
                    }
                }
                return null;
            });
            resetActivationGuards(jdbc);
            return;
        }
        jdbc.execute("SET REFERENTIAL_INTEGRITY FALSE");
        try {
            TABLES.forEach(table -> jdbc.execute("TRUNCATE TABLE " + table));
        } finally {
            jdbc.execute("SET REFERENTIAL_INTEGRITY TRUE");
        }
        resetActivationGuards(jdbc);
    }

    private static void resetActivationGuards(JdbcTemplate jdbc) {
        jdbc.update("delete from customer_activation_guards where guard_key not in ('global', 'generation')");
        jdbc.update("update customer_activation_guards set attempts = 0");
    }
}
