package com.game_manager.gm.gamingsession.billing;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.dto.SqlPages;
import com.game_manager.gm.common.error.ApplicationException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class GamingFinanceReportService {
    private final JdbcTemplate jdbc;

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public Map<String,Object> report(Instant from,Instant until) {
        interval(from,until);
        var a=Timestamp.from(from); var b=Timestamp.from(until);
        return Map.ofEntries(
            Map.entry("currency","RSD"),Map.entry("from",from),Map.entry("until",until),Map.entry("receiptType","INTERNAL_NON_FISCAL"),
            Map.entry("totals",jdbc.queryForMap("SELECT COALESCE(SUM(CASE WHEN kind='TIME_GRANT' THEN amount ELSE 0 END),0) AS external_receipts,COALESCE(SUM(CASE WHEN kind='TIME_REFUND' THEN amount ELSE 0 END),0) AS external_refunds FROM gaming_financial_operations WHERE created_at>=? AND created_at<?",a,b)),
            Map.entry("timeBalanceSeconds",jdbc.queryForObject("SELECT COALESCE(SUM(balance_seconds),0) FROM gaming_time_accounts",Long.class)),
            Map.entry("manualTime",jdbc.queryForMap("SELECT COUNT(*) AS transactions,COALESCE(SUM(amount),0) AS recorded_RSD,COALESCE(SUM(granted_seconds),0) AS granted_seconds FROM gaming_financial_operations WHERE kind='TIME_GRANT' AND created_at>=? AND created_at<?",a,b)),
            Map.entry("recorded",jdbc.queryForList("SELECT kind,method,COUNT(*) AS transactions,SUM(amount) AS amount FROM gaming_financial_operations WHERE created_at>=? AND created_at<? GROUP BY kind,method",a,b)),
            Map.entry("historical",jdbc.queryForMap("SELECT COUNT(*) AS transactions,COALESCE(SUM(CASE WHEN kind IN ('PAYMENT','CREDIT_TOPUP','PACKAGE_SALE') AND method IN ('CASH','EXTERNAL_POS') THEN amount ELSE 0 END),0) AS external_receipts,COALESCE(SUM(CASE WHEN kind='REFUND' AND method IN ('CASH','EXTERNAL_POS') THEN amount ELSE 0 END),0) AS external_refunds FROM gaming_history_financial_operations WHERE created_at>=? AND created_at<?",a,b)),
            Map.entry("historicalMoneyBalance",jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM gaming_history_wallet_entries",java.math.BigDecimal.class)),
            Map.entry("sessions",jdbc.queryForList("SELECT status,COUNT(*) AS sessions,SUM(billed_seconds) AS duration_seconds FROM gaming_sessions WHERE billing_mode='TIME_BALANCE' AND started_at>=? AND started_at<? GROUP BY status",a,b)),
            Map.entry("productOrders",jdbc.queryForList("SELECT status,COUNT(*) AS orders_count,SUM(total_price) AS order_value FROM orders WHERE created_at>=? AND created_at<? GROUP BY status",a,b)));
    }

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public PageResponse<Map<String,Object>> details(String table,Instant from,Instant until,int page,int size) {
        interval(from,until);
        String select=switch(table) {
            case "manualPayments" -> "SELECT f.id,f.customer_id,u.name AS customer_name,f.actor_id,f.kind,f.method,f.amount,f.granted_seconds,f.reason,f.reference,f.created_at FROM gaming_financial_operations f JOIN users u ON u.id=f.customer_id WHERE f.created_at>=? AND f.created_at<?";
            // These are payment recording locations, not an allocation of consumed minutes to revenue.
            case "byStation" -> "SELECT f.resource_id,COALESCE(r.name,'Bez računara') AS name,f.kind,f.method,COUNT(*) AS transactions,SUM(f.amount) AS amount FROM gaming_financial_operations f LEFT JOIN physical_resources r ON r.id=f.resource_id WHERE f.created_at>=? AND f.created_at<? GROUP BY f.resource_id,r.name,f.kind,f.method";
            case "byLocation" -> "SELECT f.location_id,COALESCE(l.name,'Bez lokacije') AS name,f.kind,f.method,SUM(f.amount) AS amount FROM gaming_financial_operations f LEFT JOIN locations l ON l.id=f.location_id WHERE f.created_at>=? AND f.created_at<? GROUP BY f.location_id,l.name,f.kind,f.method";
            case "byEmployee" -> "SELECT f.actor_id,u.name,f.kind,f.method,COUNT(*) AS transactions,SUM(f.amount) AS amount FROM gaming_financial_operations f JOIN users u ON u.id=f.actor_id WHERE f.created_at>=? AND f.created_at<? GROUP BY f.actor_id,u.name,f.kind,f.method";
            case "history" -> "SELECT f.id,f.customer_id,u.name AS customer_name,f.kind,f.method,f.amount,f.reference,f.reason,f.created_at FROM gaming_history_financial_operations f LEFT JOIN users u ON u.id=f.customer_id WHERE f.created_at>=? AND f.created_at<?";
            default -> throw new ApplicationException(HttpStatus.BAD_REQUEST,"Unknown finance detail table");
        };
        String order=switch(table) {
            case "byStation" -> "resource_id,kind,method";
            case "byLocation" -> "location_id,kind,method";
            case "byEmployee" -> "actor_id,kind,method";
            default -> "created_at DESC,id DESC";
        };
        return SqlPages.maps(jdbc,select,order,page,size,Timestamp.from(from),Timestamp.from(until));
    }

    private static void interval(Instant from,Instant until) {
        if(!until.isAfter(from) || Duration.between(from,until).toDays()>366)
            throw new ApplicationException(HttpStatus.BAD_REQUEST,"Choose a report interval of at most 366 days");
    }
}
