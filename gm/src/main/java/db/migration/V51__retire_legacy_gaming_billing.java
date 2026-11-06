package db.migration;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** Offline schema cutover. V43--V50 remain immutable; no seconds are credited here. */
public class V51__retire_legacy_gaming_billing extends BaseJavaMigration {
    private static final List<String> RETIRED = List.of("gaming_wallet_ledger", "gaming_time_packages",
            "gaming_tariffs", "gaming_charges", "gaming_business_policy");

    @Override public boolean canExecuteInTransaction() { return false; }

    @Override public void migrate(Context context) throws Exception {
        Connection db = context.getConnection();
        requireZero(db, "SELECT COUNT(*) FROM gaming_sessions WHERE billing_mode<>'TIME_BALANCE' AND status='ACTIVE'",
                "Close and reconcile active legacy sessions with the previous backend before upgrading");
        requireZero(db, "SELECT COUNT(*) FROM gaming_time_accounts a WHERE balance_seconds<0 OR balance_seconds<>"
                + "COALESCE((SELECT SUM(delta_seconds) FROM gaming_time_ledger l WHERE l.customer_id=a.customer_id),0)",
                "Time account and ledger disagree; restore financial consistency before upgrading");
        requireZero(db, "SELECT COUNT(*) FROM (SELECT p.id FROM gaming_time_packages p LEFT JOIN gaming_wallet_ledger l ON l.package_id=p.id "
                + "GROUP BY p.id,p.minutes HAVING COALESCE(SUM(l.minutes),0)<0 OR COALESCE(SUM(l.minutes),0)>p.minutes) invalid_packages",
                "Historical package ledger is inconsistent; no data has been removed");
        requireZero(db, "SELECT COUNT(*) FROM (SELECT p.customer_id,SUM(l.minutes)*60 AS seconds FROM gaming_time_packages p "
                + "JOIN gaming_wallet_ledger l ON l.package_id=p.id GROUP BY p.customer_id) p WHERE p.seconds>COALESCE("
                + "(SELECT SUM(t.delta_seconds) FROM gaming_time_ledger t WHERE t.customer_id=p.customer_id AND t.kind='MIGRATION' "
                + "AND t.source_key IN (CONCAT('legacy-packages:',p.customer_id),CONCAT('legacy-packages-no-expiry:',p.customer_id))),0)",
                "V48/V50 did not preserve all purchased package seconds; reconcile before retiring the source tables");
        requireZero(db, "SELECT COUNT(*) FROM gaming_time_ledger l JOIN gaming_financial_operations f ON f.id=l.operation_id "
                + "WHERE f.kind NOT IN ('TIME_GRANT','TIME_REFUND')",
                "A current time ledger entry references legacy money; an explicit audited reconciliation is required");
        requireZero(db, "SELECT COUNT(*) FROM gaming_financial_operations f JOIN gaming_financial_operations p ON p.id=f.original_id "
                + "WHERE f.kind IN ('TIME_GRANT','TIME_REFUND') AND p.kind NOT IN ('TIME_GRANT','TIME_REFUND')",
                "A current financial operation references legacy money; reconcile before upgrading");
        requireZero(db, "SELECT COUNT(*) FROM gaming_financial_operations WHERE kind IN ('TIME_GRANT','TIME_REFUND') AND method NOT IN ('CASH','EXTERNAL_POS')",
                "Current time payments must use CASH or EXTERNAL_POS");
        requireZero(db, "SELECT CASE WHEN COUNT(*)=1 THEN 0 ELSE 1 END FROM gaming_business_policy WHERE id=1",
                "The gaming minute price configuration is missing");
        requireKnownDependencies(db);

        // CTAS intentionally creates independent archives without business foreign keys or
        // generated columns. Original identifiers, decimals, timestamps and snapshots survive.
        archive(db, "gaming_wallet_ledger", "gaming_history_wallet_entries", "1=1");
        archive(db, "gaming_time_packages", "gaming_history_packages", "1=1");
        archive(db, "gaming_tariffs", "gaming_history_tariffs", "1=1");
        archive(db, "gaming_charges", "gaming_history_charges", "1=1");
        archive(db, "gaming_business_policy", "gaming_history_policy", "1=1");
        archive(db, "gaming_sessions", "gaming_history_sessions", "billing_mode<>'TIME_BALANCE'");
        archive(db, "gaming_financial_operations", "gaming_history_financial_operations", "kind NOT IN ('TIME_GRANT','TIME_REFUND')");
        execute(db, "CREATE INDEX idx_history_fin_customer ON gaming_history_financial_operations(customer_id,created_at,id)");
        execute(db, "CREATE INDEX idx_history_fin_reporting ON gaming_history_financial_operations(created_at,kind,method)");

        execute(db, "CREATE TABLE gaming_time_price (id INT PRIMARY KEY,minute_price DECIMAL(12,2) NULL,"
                + "time_price_version BIGINT NOT NULL,CONSTRAINT chk_time_price CHECK(id=1 AND (minute_price IS NULL OR minute_price>0) AND time_price_version>=0))");
        execute(db, "INSERT INTO gaming_time_price SELECT id,minute_price,time_price_version FROM gaming_business_policy WHERE id=1");

        // Drop only after every source has a complete independent copy. Never disable FK checks.
        for (String table : RETIRED) execute(db, "DROP TABLE " + table);
        String foreignKey = "MySQL".equals(db.getMetaData().getDatabaseProductName()) ? "FOREIGN KEY" : "CONSTRAINT";
        execute(db, "ALTER TABLE gaming_financial_operations DROP " + foreignKey + " fk_fin_original");
        execute(db, "DELETE FROM gaming_financial_operations WHERE kind NOT IN ('TIME_GRANT','TIME_REFUND')");
        execute(db, "ALTER TABLE gaming_financial_operations ADD CONSTRAINT fk_fin_original FOREIGN KEY(original_id) REFERENCES gaming_financial_operations(id)");
        execute(db, "ALTER TABLE gaming_financial_operations DROP CONSTRAINT chk_fin_kind");
        execute(db, "ALTER TABLE gaming_financial_operations DROP CONSTRAINT chk_fin_method");
        execute(db, "ALTER TABLE gaming_financial_operations ADD CONSTRAINT chk_fin_kind CHECK(kind IN ('TIME_GRANT','TIME_REFUND'))");
        execute(db, "ALTER TABLE gaming_financial_operations ADD CONSTRAINT chk_fin_method CHECK(method IN ('CASH','EXTERNAL_POS'))");

        execute(db, "ALTER TABLE gaming_sessions DROP CONSTRAINT chk_metered_session");
        execute(db, "ALTER TABLE gaming_sessions DROP CONSTRAINT chk_time_session");
        execute(db, "UPDATE gaming_sessions SET billing_mode='HISTORICAL' WHERE billing_mode<>'TIME_BALANCE'");
        for (String column : List.of("metered_tariff_id", "metered_price", "metered_tariff_seconds", "billing_unit_seconds", "charged_amount", "legacy_minutes"))
            execute(db, "ALTER TABLE gaming_sessions DROP COLUMN " + column);
        execute(db, "ALTER TABLE gaming_sessions ALTER COLUMN billing_mode SET DEFAULT 'TIME_BALANCE'");
        execute(db, "ALTER TABLE gaming_sessions ADD CONSTRAINT chk_time_session CHECK(billed_seconds>=0 AND "
                + "((billing_mode='HISTORICAL' AND status<>'ACTIVE') OR (billing_mode='TIME_BALANCE' AND customer_id IS NOT NULL "
                + "AND guest_name IS NULL AND move_target_id IS NULL AND metered_lease_until IS NOT NULL AND last_billed_at IS NOT NULL "
                + "AND access_until IS NOT NULL AND ends_at<=access_until AND last_billed_at>=started_at)))");
        // gaming_time_accounts, gaming_time_ledger, current payments, audit and command
        // history are never rewritten. Lock acknowledgements remain real Client evidence.
    }

    private static void requireKnownDependencies(Connection db) throws SQLException {
        Set<String> retired = Set.copyOf(RETIRED);
        try (var tables = db.getMetaData().getTables(db.getCatalog(), null, "%", null)) {
            while (tables.next()) {
                String name = tables.getString("TABLE_NAME");
                if (!retired.contains(name.toLowerCase(Locale.ROOT))) continue;
                try (var keys = db.getMetaData().getExportedKeys(db.getCatalog(), tables.getString("TABLE_SCHEM"), name)) {
                    while (keys.next()) if (!retired.contains(keys.getString("FKTABLE_NAME").toLowerCase(Locale.ROOT)))
                        throw new SQLException("V51: unexpected dependency " + keys.getString("FKTABLE_NAME") + " -> " + name + "; no source tables were removed");
                }
            }
        }
    }

    private static void archive(Connection db, String source, String target, String filter) throws SQLException {
        execute(db, "CREATE TABLE " + target + " AS SELECT * FROM " + source + " WHERE " + filter);
        execute(db, "ALTER TABLE " + target + " ADD PRIMARY KEY(id)");
        if (count(db, "SELECT COUNT(*) FROM " + source + " WHERE " + filter) != count(db, "SELECT COUNT(*) FROM " + target))
            throw new SQLException("V51: incomplete archive " + target + "; source tables retained");
    }

    private static void requireZero(Connection db, String sql, String message) throws SQLException {
        if (count(db, sql) != 0) throw new SQLException("V51: " + message);
    }
    private static long count(Connection db, String sql) throws SQLException {
        try (var statement = db.createStatement(); var rows = statement.executeQuery(sql)) { rows.next(); return rows.getLong(1); }
    }
    private static void execute(Connection db, String sql) throws SQLException {
        try (var statement = db.createStatement()) { statement.execute(sql); }
    }
}
