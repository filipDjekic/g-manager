package com.game_manager.gm.gamingsession.billing;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.gamingsession.*;
import java.math.BigDecimal;
import java.sql.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only historical financial projections. Purchases use the customer time account. */
@Service @RequiredArgsConstructor
public class GamingBillingService {
    private final JdbcTemplate jdbc;
    private final CurrentUserProvider current;
    private final GamingSessionLocationPolicy scope;
    private final GamingSessionRepository sessions;
    private static final BigDecimal ZERO=new BigDecimal("0.00");

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public Map<String,Object> account(UUID id) {
        GamingSession s=sessions.findById(id).orElseThrow(()->error("Session not found"));scope.requireResourceAccess(current.requireCurrentUser(),s.getResourceId());
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("sessionId",id);result.put("customerId",s.getCustomerId());result.put("billingMode",s.getBillingMode().name());result.put("currency","RSD");result.put("due",due(id));
        result.put("charges",jdbc.queryForList("SELECT * FROM gaming_charges WHERE session_id=? ORDER BY created_at,id",str(id)));
        result.put("transactions",jdbc.queryForList("SELECT * FROM gaming_financial_operations WHERE session_id=? ORDER BY created_at,id",str(id)));result.put("receiptType","INTERNAL_NON_FISCAL");
        return result;
    }

    public Map<UUID,BigDecimal> dues(Collection<UUID> ids) {
        Map<UUID,BigDecimal> result=new HashMap<>();if(ids.isEmpty())return result;
        String placeholders=String.join(",",Collections.nCopies(ids.size(),"?"));Object[] args=ids.stream().map(UUID::toString).toArray();
        jdbc.query("SELECT session_id,SUM(amount) FROM gaming_charges WHERE session_id IN ("+placeholders+") GROUP BY session_id",
                (org.springframework.jdbc.core.RowCallbackHandler)r->result.put(UUID.fromString(r.getString(1)),r.getBigDecimal(2)),args);
        jdbc.query("SELECT session_id,SUM(amount) FROM gaming_financial_operations WHERE kind='PAYMENT' AND session_id IN ("+placeholders+") GROUP BY session_id",
                (org.springframework.jdbc.core.RowCallbackHandler)r->result.compute(UUID.fromString(r.getString(1)),(id,amount)->(amount==null?ZERO:amount).subtract(decimal(r))),args);
        return result;
    }

    private BigDecimal decimal(ResultSet r) {try{return r.getBigDecimal(2);}catch(SQLException e){throw new IllegalStateException(e);}}

    public BigDecimal due(UUID id) {
        BigDecimal charges=jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM gaming_charges WHERE session_id=?",BigDecimal.class,str(id));
        BigDecimal paid=jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM gaming_financial_operations WHERE session_id=? AND kind='PAYMENT'",BigDecimal.class,str(id));
        return charges.subtract(paid).max(ZERO);
    }

    public Map<UUID,BigDecimal> balances(Collection<UUID> customers) {
        if(customers.isEmpty()) return Map.of();
        String placeholders=String.join(",",Collections.nCopies(customers.size(),"?"));
        Map<UUID,BigDecimal> result=new HashMap<>();
        jdbc.query("SELECT customer_id,SUM(amount) FROM gaming_wallet_ledger WHERE customer_id IN ("+placeholders+") GROUP BY customer_id",(org.springframework.jdbc.core.RowCallbackHandler)r->result.put(UUID.fromString(r.getString(1)),r.getBigDecimal(2)),customers.stream().map(UUID::toString).toArray());
        return result;
    }

    private static String str(UUID id) { return id==null?null:id.toString(); }
    private static ApplicationException error(String message) { return new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,message); }
}
