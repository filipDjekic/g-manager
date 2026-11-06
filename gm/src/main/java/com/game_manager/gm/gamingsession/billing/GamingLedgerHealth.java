package com.game_manager.gm.gamingsession.billing;

import io.micrometer.core.instrument.*;
import org.springframework.boot.health.contributor.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Read-only financial alarm. Repairs always require an audited business operation or isolated restore. */
@Component("gamingLedger")
public class GamingLedgerHealth implements HealthIndicator {
    private final JdbcTemplate jdbc;
    private volatile long violations;
    public GamingLedgerHealth(JdbcTemplate jdbc,MeterRegistry meters) {
        this.jdbc=jdbc;Gauge.builder("gmanager.gaming.ledger.violations",this,v->v.violations).register(meters);
    }
    @Scheduled(fixedDelayString="${app.gaming-client.ledger-check-millis:60000}")
    public long check() {
        Long count=jdbc.queryForObject("""
                SELECT
                 (SELECT COUNT(*) FROM gaming_time_accounts a WHERE a.balance_seconds<0 OR a.balance_seconds<>COALESCE((SELECT SUM(t.delta_seconds) FROM gaming_time_ledger t WHERE t.customer_id=a.customer_id),0))
                +                 (SELECT COUNT(*) FROM (SELECT customer_id FROM gaming_wallet_ledger WHERE package_id IS NULL GROUP BY customer_id HAVING SUM(amount)<0) negative_wallets)
                +(SELECT COUNT(*) FROM (SELECT p.id FROM gaming_time_packages p LEFT JOIN gaming_wallet_ledger l ON l.package_id=p.id GROUP BY p.id,p.minutes HAVING COALESCE(SUM(l.minutes),0)<0 OR COALESCE(SUM(l.minutes),0)>p.minutes) invalid_packages)
                +(SELECT COUNT(*) FROM gaming_wallet_ledger WHERE amount<>0 AND operation_id IS NULL)
                +(SELECT COUNT(*) FROM (SELECT p.id FROM gaming_financial_operations p JOIN gaming_financial_operations r ON r.original_id=p.id AND r.kind IN ('REFUND','TIME_REFUND') GROUP BY p.id,p.amount HAVING SUM(r.amount)>p.amount) excess_refunds)
                """,Long.class);
        violations=count==null?0:count;return violations;
    }
    @Override public Health health() {
        try {long count=check();return (count==0?Health.up():Health.status("DEGRADED")).withDetail("violations",count).build();}
        catch(org.springframework.dao.DataAccessException e){return Health.down().withDetail("reason","database-unavailable").build();}
    }
}
