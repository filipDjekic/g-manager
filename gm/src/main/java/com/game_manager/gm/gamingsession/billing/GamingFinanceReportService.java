package com.game_manager.gm.gamingsession.billing;
import com.game_manager.gm.common.error.ApplicationException;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
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
        if(!until.isAfter(from) || Duration.between(from,until).toDays()>366) throw new ApplicationException(HttpStatus.BAD_REQUEST,"Choose a report interval of at most 366 days");
        var a=Timestamp.from(from);var b=Timestamp.from(until);
        return Map.ofEntries(
            Map.entry("currency","RSD"),Map.entry("from",from),Map.entry("until",until),Map.entry("receiptType","INTERNAL_NON_FISCAL"),
            Map.entry("totals",jdbc.queryForMap("SELECT COALESCE(SUM(CASE WHEN kind IN ('PAYMENT','CREDIT_TOPUP','PACKAGE_SALE') AND method IN ('CASH','EXTERNAL_POS') THEN amount ELSE 0 END),0) AS external_receipts,COALESCE(SUM(CASE WHEN kind='REFUND' AND method IN ('CASH','EXTERNAL_POS') THEN amount ELSE 0 END),0) AS external_refunds,COALESCE(SUM(CASE WHEN kind='PAYMENT' THEN amount ELSE 0 END),0) AS gaming_collected,COALESCE(SUM(CASE WHEN kind='REFUND' AND session_id IS NOT NULL THEN amount ELSE 0 END),0) AS gaming_refunds FROM gaming_financial_operations WHERE created_at>=? AND created_at<?",a,b)),
            Map.entry("activePackageLiability",jdbc.queryForObject("SELECT COALESCE(SUM(ROUND(p.price*l.remaining_minutes/p.minutes,2)),0) FROM gaming_time_packages p JOIN (SELECT package_id,SUM(minutes) AS remaining_minutes FROM gaming_wallet_ledger WHERE package_id IS NOT NULL GROUP BY package_id) l ON l.package_id=p.id WHERE p.expires_at IS NULL OR p.expires_at>CURRENT_TIMESTAMP",java.math.BigDecimal.class)),
            Map.entry("recorded",jdbc.queryForList("SELECT kind,method,COUNT(*) AS transactions,SUM(amount) AS amount FROM gaming_financial_operations WHERE created_at>=? AND created_at<? GROUP BY kind,method",a,b)),
            Map.entry("outstandingDebt",jdbc.queryForObject("SELECT COALESCE(SUM(c.amount),0)-(SELECT COALESCE(SUM(p.amount),0) FROM gaming_financial_operations p WHERE p.kind='PAYMENT') FROM gaming_charges c",java.math.BigDecimal.class)),
            Map.entry("prepaidLiability",jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM gaming_wallet_ledger",java.math.BigDecimal.class)),
            Map.entry("sessions",jdbc.queryForList("SELECT status,COUNT(*) AS sessions,SUM(TIMESTAMPDIFF(SECOND,started_at,COALESCE(ended_at,LEAST(ends_at,CURRENT_TIMESTAMP)))) AS duration_seconds FROM gaming_sessions WHERE started_at>=? AND started_at<? GROUP BY status",a,b)),
            Map.entry("productOrders",jdbc.queryForList("SELECT status,COUNT(*) AS orders_count,SUM(total_price) AS order_value FROM orders WHERE created_at>=? AND created_at<? GROUP BY status",a,b)));
    }
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public com.game_manager.gm.common.dto.PageResponse<Map<String,Object>> details(String table,Instant from,Instant until,int page,int size) {
        if(!until.isAfter(from)||Duration.between(from,until).toDays()>366)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Choose a report interval of at most 366 days");
        String select=switch(table){
            case "byStation" -> "SELECT r.id AS resource_id,r.name,COALESCE(c.allocated,0) AS allocated_gaming_revenue,COALESCE(c.minutes,0) AS purchased_minutes,COALESCE(f.collected,0) AS gaming_collected,COALESCE(f.refunded,0) AS gaming_refunds,COALESCE(f.collected,0)-COALESCE(f.refunded,0) AS net_gaming_collected FROM physical_resources r LEFT JOIN (SELECT resource_id,SUM(recognized_amount) AS allocated,SUM(minutes) AS minutes FROM gaming_charges WHERE created_at>=? AND created_at<? GROUP BY resource_id) c ON c.resource_id=r.id LEFT JOIN (SELECT resource_id,SUM(CASE WHEN kind='PAYMENT' THEN amount ELSE 0 END) AS collected,SUM(CASE WHEN kind='REFUND' THEN amount ELSE 0 END) AS refunded FROM gaming_financial_operations WHERE session_id IS NOT NULL AND kind IN ('PAYMENT','REFUND') AND created_at>=? AND created_at<? GROUP BY resource_id) f ON f.resource_id=r.id WHERE c.resource_id IS NOT NULL OR f.resource_id IS NOT NULL";
            case "byLocation" -> "SELECT f.location_id,l.name,f.kind,f.method,SUM(f.amount) AS amount FROM gaming_financial_operations f JOIN locations l ON l.id=f.location_id WHERE f.created_at>=? AND f.created_at<? GROUP BY f.location_id,l.name,f.kind,f.method";
            case "byEmployee" -> "SELECT f.actor_id,u.name,f.kind,f.method,COUNT(*) AS transactions,SUM(f.amount) AS amount FROM gaming_financial_operations f JOIN users u ON u.id=f.actor_id WHERE f.created_at>=? AND f.created_at<? GROUP BY f.actor_id,u.name,f.kind,f.method";
            case "packages" -> "SELECT p.id,p.customer_id,u.name AS customer_name,p.expires_at,p.price,p.minutes,COALESCE(SUM(l.minutes),0) AS remaining_minutes FROM gaming_time_packages p JOIN users u ON u.id=p.customer_id LEFT JOIN gaming_wallet_ledger l ON l.package_id=p.id GROUP BY p.id,p.customer_id,u.name,p.expires_at,p.price,p.minutes";
            default -> throw new ApplicationException(HttpStatus.BAD_REQUEST,"Unknown finance detail table");
        };
        String order=switch(table){case "byStation" -> "resource_id";case "byLocation" -> "location_id,kind,method";case "byEmployee" -> "actor_id,kind,method";default -> "id";};
        var a=Timestamp.from(from);var b=Timestamp.from(until);
        Object[] args=switch(table){case "byStation" -> new Object[]{a,b,a,b};case "packages" -> new Object[]{};default -> new Object[]{a,b};};
        return com.game_manager.gm.common.dto.SqlPages.maps(jdbc,select,order,page,size,args);
    }
}
