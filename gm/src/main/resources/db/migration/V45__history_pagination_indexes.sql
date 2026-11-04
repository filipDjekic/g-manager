-- Customer history needs chronological range scans; status-only indices do not serve this order.
CREATE INDEX idx_gaming_session_customer_history ON gaming_sessions (customer_id, started_at);
-- Ledger pages and financial history are scoped before sorting; the PK supplies the final id tie-breaker.
CREATE INDEX idx_wallet_customer_history ON gaming_wallet_ledger (customer_id, created_at);
CREATE INDEX idx_fin_customer_history ON gaming_financial_operations (customer_id, session_id, created_at);
CREATE INDEX idx_package_customer_history ON gaming_time_packages (customer_id, created_at);
-- Unfiltered absence pages and the command side of the combined station timeline.
CREATE INDEX idx_time_off_chronological ON employee_time_off (starts_at);
CREATE INDEX idx_command_station_history ON station_commands (station_id, available_at);
