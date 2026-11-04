package com.game_manager.gm.gamingsession.billing;

import static com.game_manager.gm.gamingsession.billing.GamingBillingDtos.*;
import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.user.*;
import java.math.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service @RequiredArgsConstructor
public class GamingBillingService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final CurrentUserProvider current;
    private final GamingSessionLocationPolicy scope;
    private final GamingSessionRepository sessions;
    private final UserRepository users;
    private final PhysicalResourceRepository resources;
    private final AuditWriter audit;
    private final com.game_manager.gm.reservation.ReservationRepository reservations;
    private final com.game_manager.gm.gamingsession.command.StationCommandWriter stationCommands;
    private final com.game_manager.gm.events.OutboxWriter outbox;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Value("${app.gaming-client.lease-duration-seconds:30}") private long meteredLeaseSeconds=30;
    private final jakarta.persistence.EntityManager entityManager;
    private static final BigDecimal ZERO = new BigDecimal("0.00");

    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public List<Tariff> tariffs() { return jdbc.query("SELECT * FROM gaming_tariffs ORDER BY name,id", this::tariff); }
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public Policy policy() {
        return jdbc.query("SELECT * FROM gaming_business_policy WHERE id=1", (r,n) -> new Policy(
                r.getBoolean("allow_partial"),r.getBoolean("allow_debt"),r.getBoolean("allow_refunds"),
                r.getInt("minimum_minutes"),r.getInt("maximum_minutes"),r.getBigDecimal("employee_discount_limit"),r.getLong("version")))
                .stream().findFirst().orElse(new Policy(false,false,false,15,480,ZERO,0));
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public Policy savePolicy(Policy p) {
        if (p.minimumMinutes()>p.maximumMinutes()) fail("Minimum exceeds maximum duration");
        if (jdbc.update("UPDATE gaming_business_policy SET allow_partial=?,allow_debt=?,allow_refunds=?,minimum_minutes=?,maximum_minutes=?,employee_discount_limit=?,version=version+1 WHERE id=1 AND version=?",
                p.allowPartialPayment(),p.allowDebt(),p.allowRefunds(),p.minimumMinutes(),p.maximumMinutes(),p.employeeDiscountLimit(),p.version())!=1) conflict("Policy changed; refresh");
        audit("GAMING_POLICY_UPDATED",null,p,null); return policy();
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public Tariff saveTariff(UUID id,TariffInput t) {
        if(t.validFrom()!=null && t.validUntil()!=null && !t.validUntil().isAfter(t.validFrom())) fail("Invalid promotion interval");
        if(t.serviceId()!=null && jdbc.queryForObject("SELECT COUNT(*) FROM catalog_items WHERE id=? AND type='SERVICE'",Integer.class,t.serviceId().toString())!=1) fail("Gaming service not found");
        UUID target=id==null?UUID.randomUUID():id;
        if(id==null) jdbc.update("INSERT INTO gaming_tariffs (id,name,service_id,minutes,price,currency,active,valid_from,valid_until,package_validity_days,version) VALUES (?,?,?,?,?,'RSD',?,?,?,?,0)",
                target.toString(),t.name().trim(),str(t.serviceId()),t.minutes(),money(t.price()),t.active(),ts(t.validFrom()),ts(t.validUntil()),t.packageValidityDays());
        else if(jdbc.update("UPDATE gaming_tariffs SET name=?,service_id=?,minutes=?,price=?,active=?,valid_from=?,valid_until=?,package_validity_days=?,version=version+1 WHERE id=? AND version=?",
                t.name().trim(),str(t.serviceId()),t.minutes(),money(t.price()),t.active(),ts(t.validFrom()),ts(t.validUntil()),t.packageValidityDays(),id.toString(),t.version())!=1) conflict("Tariff changed; refresh");
        audit("GAMING_TARIFF_UPDATED",target,t,null); return requireTariff(target);
    }
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public Quote quote(UUID resourceId,UUID tariffId,int minutes,BigDecimal discount,UUID packageId) {
        scope.requireResourceAccess(current.requireCurrentUser(),resourceId);
        return packageId==null ? calculate(requireTariff(tariffId),resourceId,minutes,discount) : packageQuote(resourceId,packageId,minutes,discount);
    }
    public Quote calculate(Tariff t,UUID resourceId,int minutes,BigDecimal discount) {
        Policy p=policy(); Instant now=clock.instant();
        if(!t.active() || t.validFrom()!=null && now.isBefore(t.validFrom()) || t.validUntil()!=null && !now.isBefore(t.validUntil())) fail("Tariff is not currently available");
        PhysicalResource resource=resources.findById(resourceId).orElseThrow(()->error("Station not found"));
        if(t.serviceId()!=null && !t.serviceId().equals(resource.getServiceId())) fail("Tariff does not match the station category/service");
        if(minutes<p.minimumMinutes() || minutes>p.maximumMinutes() || minutes%t.minutes()!=0) fail("Duration must be a whole tariff block within the configured session limits");
        BigDecimal percent=discount==null?ZERO:discount;
        if(percent.signum()<0 || percent.compareTo(new BigDecimal("100"))>0 || percent.scale()>2) fail("Invalid discount");
        AuthenticatedUser actor=current.requireCurrentUser();
        if(actor.role()==Role.EMPLOYEE && percent.compareTo(p.employeeDiscountLimit())>0) forbidden("Discount exceeds employee allowance");
        BigDecimal gross=money(t.price().multiply(BigDecimal.valueOf(minutes/t.minutes())));
        BigDecimal reduction=gross.multiply(percent).divide(new BigDecimal("100"),2,RoundingMode.HALF_UP);
        return new Quote(t.id(),t.version(),t.name(),minutes,gross,reduction,gross.subtract(reduction),"RSD","WHOLE_BLOCKS; HALF_UP 2 decimals; extensions separately priced; unused time has no automatic refund");
    }
    /** Called in the same transaction as the entitlement and command. Ledger rows are immutable. */
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void charge(GamingSession s,int minutes,Purchase purchase) {
        if(purchase==null) fail("Select a tariff and confirm payment before starting or extending");
        boolean packageUse=purchase.payment().method()==Method.TIME_PACKAGE;
        Tariff t=packageUse ? packageTariff(purchase.packageId()) : requireTariff(purchase.tariffId());
        if(!packageUse && t.version()!=purchase.tariffVersion()) conflict("Tariff price changed; review the new quote");
        Quote q=packageUse ? packageQuote(s.getResourceId(),purchase.packageId(),minutes,purchase.discountPercent()) : calculate(t,s.getResourceId(),minutes,purchase.discountPercent());
        if(q.discount().signum()>0 && (purchase.reason()==null || purchase.reason().isBlank())) fail("Discount reason is required");
        BigDecimal amount=q.total(),recognized=amount;
        if(purchase.payment().method()==Method.TIME_PACKAGE) {
            if(s.getCustomerId()==null || purchase.packageId()==null || purchase.payment().amount().signum()!=0 || q.discount().signum()!=0) fail("A registered customer's time package is required (zero cash payment and no extra discount)");
            lockCustomer(s.getCustomerId());
            var pack=jdbc.queryForList("SELECT * FROM gaming_time_packages WHERE id=? AND customer_id=? FOR UPDATE",purchase.packageId().toString(),s.getCustomerId().toString());
            if(pack.isEmpty()) fail("Time package not found");
            var item=pack.getFirst();
            if(!Objects.equals(str(t.serviceId()),text(item.get("service_id")))) fail("Time package category does not match tariff");
            if(item.get("expires_at")!=null && !((Timestamp)item.get("expires_at")).toInstant().isAfter(clock.instant())) fail("Time package expired");
            Integer available=jdbc.queryForObject("SELECT COALESCE(SUM(minutes),0) FROM gaming_wallet_ledger WHERE package_id=?",Integer.class,purchase.packageId().toString());
            if(available==null || available<minutes) conflict("Insufficient package minutes");
            ledger(s.getCustomerId(),s.getId(),purchase.packageId(),ZERO,-minutes,"PACKAGE_USE",null);
            long originalMinutes=((Number)item.get("minutes")).longValue();
            BigDecimal originalPrice=(BigDecimal)item.get("price");
            long consumed=originalMinutes-available;
            recognized=originalPrice.multiply(BigDecimal.valueOf(consumed+minutes)).divide(BigDecimal.valueOf(originalMinutes),2,RoundingMode.HALF_UP)
                    .subtract(originalPrice.multiply(BigDecimal.valueOf(consumed)).divide(BigDecimal.valueOf(originalMinutes),2,RoundingMode.HALF_UP));
            amount=ZERO;
        }
        UUID charge=UUID.randomUUID();
        Map<String,Object> snapshot=new LinkedHashMap<>(); snapshot.put("tariff",t);snapshot.put("quote",q);snapshot.put("policy",policy());snapshot.put("reason",purchase.reason());snapshot.put("packageId",purchase.packageId());
        jdbc.update("INSERT INTO gaming_charges (id,session_id,resource_id,location_id,actor_id,minutes,amount,recognized_amount,currency,snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,'RSD',?,?)",
                str(charge),str(s.getId()),str(s.getResourceId()),str(s.getLocationId()),str(current.requireCurrentUser().id()),minutes,amount,recognized,json.writeValueAsString(snapshot),ts(clock.instant()));
        settle(s,purchase.payment(),"Gaming time purchase",false);
        audit("GAMING_TIME_CHARGED",s.getId(),snapshot,purchase.reason());
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_PAYMENT_RECORD')")
    public Map<String,Object> pay(UUID id,Settlement request) {
        GamingSession s=lockSession(id);settle(s,request.payment(),request.reason(),true);return account(id);
    }
    private void settle(GamingSession s,Payment payment,String reason,boolean requirePositive) {
        if(!RolePermissions.has(current.requireCurrentUser().role(),Permission.GAMING_PAYMENT_RECORD)) forbidden("Payment permission required");
        BigDecimal due=due(s.getId()),amount=money(payment.amount());
        if(amount.signum()<0 || requirePositive && amount.signum()==0 || amount.compareTo(due)>0) fail("Payment must be positive and cannot exceed outstanding charges");
        if(payment.method()==Method.TIME_PACKAGE && amount.signum()!=0) fail("Time packages cannot settle money obligations");
        Policy p=policy();BigDecimal remaining=due.subtract(amount);
        if(remaining.signum()>0 && (!p.allowDebt() || amount.signum()>0 && !p.allowPartialPayment())) fail("Full advance payment is required by policy");
        if(amount.signum()>0) {
            externalReference(payment);
            if(payment.method()==Method.WALLET) { if(s.getCustomerId()==null) fail("Guests do not have prepaid credit");lockCustomer(s.getCustomerId());requireNoMeteredDebit(s.getCustomerId());if(balance(s.getCustomerId()).compareTo(amount)<0) conflict("Insufficient prepaid credit"); }
            UUID op=operation(s.getId(),s.getCustomerId(),s.getResourceId(),s.getLocationId(),"PAYMENT",payment.method(),amount,payment.reference(),reason,null);
            if(payment.method()==Method.WALLET) ledger(s.getCustomerId(),s.getId(),null,amount.negate(),0,"SESSION_USE",reason,op);
        }
    }
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public Map<String,Object> account(UUID id) {
        GamingSession s=sessions.findById(id).orElseThrow(()->error("Session not found"));scope.requireResourceAccess(current.requireCurrentUser(),s.getResourceId());
        return Map.of("sessionId",id,"currency","RSD","due",due(id),"charges",jdbc.queryForList("SELECT * FROM gaming_charges WHERE session_id=? ORDER BY created_at,id",str(id)),
                "transactions",jdbc.queryForList("SELECT * FROM gaming_financial_operations WHERE session_id=? ORDER BY created_at,id",str(id)),"receiptType","INTERNAL_NON_FISCAL");
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public Map<String,Object> refund(UUID id,Refund request) {
        GamingSession s=lockSession(id); if(!policy().allowRefunds()) fail("Refunds are disabled");
        if(s.getStatus()==GamingSessionStatus.ACTIVE) conflict("End the session before refunding; a refund cannot modify the signed entitlement");
        var rows=jdbc.queryForList("SELECT * FROM gaming_financial_operations WHERE id=? AND session_id=? AND kind='PAYMENT'",str(request.paymentId()),str(id));
        if(rows.isEmpty()) fail("Original payment not found"); var original=rows.getFirst();
        BigDecimal refunded=jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM gaming_financial_operations WHERE original_id=? AND kind='REFUND'",BigDecimal.class,str(request.paymentId()));
        BigDecimal amount=money(request.amount());
        if(amount.signum()<=0 || amount.compareTo(((BigDecimal)original.get("amount")).subtract(refunded))>0) fail("Refund exceeds original unrefunded payment");
        Method method=Method.valueOf(original.get("method").toString());
        UUID op=operation(id,s.getCustomerId(),UUID.fromString(original.get("resource_id").toString()),UUID.fromString(original.get("location_id").toString()),"REFUND",method,amount,null,request.reason(),request.paymentId());
        if(method==Method.WALLET) {lockLedgerCustomer(s.getCustomerId());ledger(s.getCustomerId(),s.getId(),null,amount,0,"REFUND",request.reason(),op);}
        return account(id);
    }
    @Transactional(readOnly=true) @PreAuthorize("isAuthenticated()")
    public Map<String,Object> wallet(UUID customerId) {
        var actor=current.requireCurrentUser();
        if(actor.role()==Role.CUSTOMER ? !actor.id().equals(customerId) : !RolePermissions.has(actor.role(),Permission.CUSTOMER_READ)) forbidden("Wallet access denied");
        return Map.of("serverTime",clock.instant(),"customerId",customerId,"balance",balance(customerId),"currency","RSD",
                "meteredSessions",jdbc.queryForList("SELECT s.id,s.resource_id,r.name AS resource_name,s.started_at,s.ends_at,s.status,s.billed_seconds,s.charged_amount,s.termination_reason FROM gaming_sessions s JOIN physical_resources r ON r.id=s.resource_id WHERE s.customer_id=? AND s.billing_mode='PREPAID_METERED' ORDER BY s.started_at DESC LIMIT 20",str(customerId)),
                "packages",jdbc.queryForList("SELECT p.*,COALESCE((SELECT SUM(l.minutes) FROM gaming_wallet_ledger l WHERE l.package_id=p.id),0) AS remaining_minutes FROM gaming_time_packages p WHERE p.customer_id=? AND (p.expires_at IS NULL OR p.expires_at>?) AND COALESCE((SELECT SUM(l.minutes) FROM gaming_wallet_ledger l WHERE l.package_id=p.id),0)>0 ORDER BY p.created_at DESC,p.id DESC",str(customerId),ts(clock.instant())));
    }
    private void requireWalletAccess(UUID customerId) {
        var actor=current.requireCurrentUser();
        if(actor.role()==Role.CUSTOMER ? !actor.id().equals(customerId) : !RolePermissions.has(actor.role(),Permission.CUSTOMER_READ)) forbidden("Wallet access denied");
    }
    @Transactional(readOnly=true) @PreAuthorize("isAuthenticated()")
    public com.game_manager.gm.common.dto.PageResponse<Map<String,Object>> walletHistory(UUID customerId,String kind,int page,int size) {
        requireWalletAccess(customerId);
        String select=switch(kind){
            case "ledger" -> "SELECT * FROM gaming_wallet_ledger WHERE customer_id=?";
            case "transactions" -> "SELECT * FROM gaming_financial_operations WHERE customer_id=? AND session_id IS NULL";
            case "packages" -> "SELECT p.*,COALESCE((SELECT SUM(l.minutes) FROM gaming_wallet_ledger l WHERE l.package_id=p.id),0) AS remaining_minutes FROM gaming_time_packages p WHERE p.customer_id=?";
            default -> throw new ApplicationException(HttpStatus.BAD_REQUEST,"Unknown wallet history");
        };
        return com.game_manager.gm.common.dto.SqlPages.maps(jdbc,select,"created_at DESC,id DESC",page,size,str(customerId));
    }
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public List<Map<String,Object>> refundableWalletPayments(UUID customerId) {
        requireWalletAccess(customerId);
        return jdbc.queryForList("SELECT f.* FROM gaming_financial_operations f WHERE f.customer_id=? AND f.session_id IS NULL AND f.kind IN ('CREDIT_TOPUP','PACKAGE_SALE') AND f.amount>COALESCE((SELECT SUM(r.amount) FROM gaming_financial_operations r WHERE r.original_id=f.id AND r.kind='REFUND'),0) ORDER BY f.created_at DESC,f.id DESC",str(customerId));
    }
    @Transactional(readOnly=true) @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public com.game_manager.gm.common.dto.PageResponse<Tariff> tariffPage(int page,int size) {
        return com.game_manager.gm.common.dto.SqlPages.query(jdbc,"SELECT * FROM gaming_tariffs","name,id",this::tariff,page,size);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_PAYMENT_RECORD')")
    public Map<String,Object> topup(UUID customerId,WalletChange r) {
        var resource=financialResource(r.resourceId());lockCustomer(customerId);externalOnly(r.payment());
        if(r.payment().amount().signum()<=0) fail("Top-up must be positive");
        UUID op=operation(null,customerId,resource.getId(),location(resource),"CREDIT_TOPUP",r.payment().method(),money(r.payment().amount()),r.payment().reference(),r.reason(),null);
        ledger(customerId,null,null,money(r.payment().amount()),0,"TOPUP",r.reason(),op);refreshMeteredCoverage(customerId);return wallet(customerId);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public Map<String,Object> adjust(UUID customerId,CreditAdjustment r) {
        var resource=financialResource(r.resourceId());lockLedgerCustomer(customerId);BigDecimal amount=money(r.amount());
        if(amount.signum()<0) requireNoMeteredDebit(customerId);
        if(amount.signum()==0 || balance(customerId).add(amount).signum()<0) fail("Adjustment must be nonzero and cannot create negative credit");
        UUID op=operation(null,customerId,resource.getId(),location(resource),"CREDIT_CORRECTION",Method.WALLET,amount.abs(),null,r.reason(),null);
        ledger(customerId,null,null,amount,0,"CORRECTION",r.reason(),op);if(amount.signum()>0)refreshMeteredCoverage(customerId);return wallet(customerId);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_PAYMENT_RECORD')")
    public Map<String,Object> buyPackage(UUID customerId,PackagePurchase r) {
        var resource=financialResource(r.resourceId());lockCustomer(customerId);Tariff t=requireTariff(r.tariffId());
        if(t.version()!=r.tariffVersion()) conflict("Tariff changed; review price");
        Quote q=calculate(t,r.resourceId(),t.minutes(),ZERO);externalOnly(r.payment());
        if(money(r.payment().amount()).compareTo(q.total())!=0) fail("A time package requires full payment of the displayed tariff price");
        UUID id=UUID.randomUUID();Instant now=clock.instant();
        jdbc.update("INSERT INTO gaming_time_packages (id,customer_id,tariff_id,service_id,minutes,price,expires_at,snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                str(id),str(customerId),str(t.id()),str(t.serviceId()),t.minutes(),q.total(),ts(t.packageValidityDays()==0?null:now.plus(Duration.ofDays(t.packageValidityDays()))),json.writeValueAsString(t),ts(now));
        UUID op=operation(null,customerId,r.resourceId(),location(resource),"PACKAGE_SALE",r.payment().method(),q.total(),r.payment().reference(),str(id),null);
        ledger(customerId,null,id,ZERO,t.minutes(),"PACKAGE_PURCHASE",null,op);return wallet(customerId);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED) @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public Map<String,Object> refundWallet(UUID customerId,Refund r) {
        lockLedgerCustomer(customerId);requireNoMeteredDebit(customerId); if(!policy().allowRefunds()) fail("Refunds are disabled");
        var rows=jdbc.queryForList("SELECT * FROM gaming_financial_operations WHERE id=? AND customer_id=? AND kind IN ('CREDIT_TOPUP','PACKAGE_SALE') FOR UPDATE",str(r.paymentId()),str(customerId));
        if(rows.isEmpty()) fail("Original top-up or package purchase not found");var original=rows.getFirst();
        BigDecimal amount=money(r.amount());
        BigDecimal refunded=jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM gaming_financial_operations WHERE original_id=? AND kind='REFUND'",BigDecimal.class,str(r.paymentId()));
        if(amount.signum()<=0 || amount.compareTo(((BigDecimal)original.get("amount")).subtract(refunded))>0) fail("Refund exceeds original unrefunded payment");
        UUID op=operation(null,customerId,UUID.fromString(original.get("resource_id").toString()),UUID.fromString(original.get("location_id").toString()),"REFUND",Method.valueOf(original.get("method").toString()),amount,null,r.reason(),r.paymentId());
        if("CREDIT_TOPUP".equals(original.get("kind"))) {
            if(balance(customerId).compareTo(amount)<0) conflict("Credit already spent; refund would create a negative balance");
            ledger(customerId,null,null,amount.negate(),0,"REFUND",r.reason(),op);
        } else {
            UUID pack=UUID.fromString(original.get("reason").toString());
            int total=jdbc.queryForObject("SELECT minutes FROM gaming_time_packages WHERE id=? FOR UPDATE",Integer.class,str(pack));
            int remaining=jdbc.queryForObject("SELECT COALESCE(SUM(minutes),0) FROM gaming_wallet_ledger WHERE package_id=?",Integer.class,str(pack));
            if(total!=remaining || amount.compareTo((BigDecimal)original.get("amount"))!=0) fail("Only a completely unused time package can be refunded, in full");
            ledger(customerId,null,pack,ZERO,-remaining,"PACKAGE_REFUND",r.reason(),op);
        }
        return wallet(customerId);
    }
    public int purchasedMinutes(UUID id) {return jdbc.queryForObject("SELECT s.legacy_minutes+(SELECT COALESCE(SUM(c.minutes),0) FROM gaming_charges c WHERE c.session_id=s.id) FROM gaming_sessions s WHERE s.id=?",Integer.class,str(id));}
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
    public record MeteredPolicy(boolean allowFixed,boolean allowMetered,GamingBillingMode defaultMode,int billingUnitSeconds) {}
    @Transactional(readOnly=true) @PreAuthorize("isAuthenticated()")
    public MeteredPolicy meteredPolicy() {
        return jdbc.queryForObject("SELECT * FROM gaming_business_policy WHERE id=1",(r,n)->new MeteredPolicy(r.getBoolean("allow_fixed"),r.getBoolean("allow_metered"),GamingBillingMode.valueOf(r.getString("default_mode")),r.getInt("billing_unit_seconds")));
    }
    @Transactional @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public MeteredPolicy saveMeteredPolicy(MeteredPolicy p) {
        if(p.defaultMode()==null || p.billingUnitSeconds()<1 || p.billingUnitSeconds()>3600 || (!p.allowFixed() && !p.allowMetered()) || (p.defaultMode()==GamingBillingMode.FIXED_DURATION ? !p.allowFixed():!p.allowMetered())) fail("Invalid billing modes or unit");
        jdbc.update("UPDATE gaming_business_policy SET allow_fixed=?,allow_metered=?,default_mode=?,billing_unit_seconds=?,version=version+1 WHERE id=1",p.allowFixed(),p.allowMetered(),p.defaultMode().name(),p.billingUnitSeconds());
        audit("GAMING_METERED_POLICY_UPDATED",null,p,null); return p;
    }
    /** Caller holds the customer lock. No money is debited on start. */
    public long prepareMetered(GamingSession session,UUID tariffId) {
        if(session.getCustomerId()==null) fail("Metered gaming requires a registered customer");
        var p=meteredPolicy(); if(!p.allowMetered()) fail("Metered gaming is disabled");
        Tariff t=requireTariff(tariffId); Instant now=clock.instant();
        if(!t.active() || t.validFrom()!=null && now.isBefore(t.validFrom()) || t.validUntil()!=null && !now.isBefore(t.validUntil())) fail("Tariff unavailable");
        var station=resources.findById(session.getResourceId()).orElseThrow(()->error("Station not found"));
        if(t.serviceId()!=null && !t.serviceId().equals(station.getServiceId())) fail("Tariff does not match station category");
        long seconds=MeteredPricing.affordable(balance(session.getCustomerId()),t.price(),t.minutes()*60L,p.billingUnitSeconds());
        if(seconds<1) fail("Insufficient prepaid credit for one billing unit");
        session.setBillingMode(GamingBillingMode.PREPAID_METERED);session.setMeteredTariffId(t.id());session.setMeteredPrice(t.price());session.setMeteredTariffSeconds(t.minutes()*60L);
        session.setBillingUnitSeconds(p.billingUnitSeconds());session.setMeteredLeaseUntil(now.plusSeconds(meteredLeaseSeconds));session.setLastBilledAt(now);
        return seconds;
    }
    /** Caller holds customer, resource and session locks, in that order. */
    public void billMetered(GamingSession s,Instant until) {
        if(s.getBillingMode()!=GamingBillingMode.PREPAID_METERED || s.getStatus()!=GamingSessionStatus.ACTIVE) return;
        Instant cutoff=until.isBefore(s.getEndsAt())?until:s.getEndsAt();
        if(s.getMeteredLeaseUntil().isBefore(cutoff)) cutoff=s.getMeteredLeaseUntil();
        Duration elapsed=Duration.between(s.getStartedAt(),cutoff);
        long seconds=Math.max(s.getBilledSeconds(),Math.max(0,elapsed.getSeconds()+(elapsed.getNano()>0?1:0)));
        BigDecimal total=MeteredPricing.total(s.getMeteredPrice(),s.getMeteredTariffSeconds(),s.getBillingUnitSeconds(),seconds);
        BigDecimal delta=total.subtract(s.getChargedAmount());
        if(delta.compareTo(balance(s.getCustomerId()))>0) conflict("Prepaid coverage invariant violated");
        if(delta.signum()>0) {
            String op=UUID.randomUUID().toString();String reference="metered:"+s.getId()+":"+seconds;
            jdbc.update("INSERT INTO gaming_charges (id,session_id,resource_id,location_id,actor_id,minutes,amount,recognized_amount,currency,snapshot,created_at,billed_seconds) VALUES (?,?,?,?,?,0,?,?,'RSD',?,?,?)",
                UUID.randomUUID().toString(),str(s.getId()),str(s.getResourceId()),str(s.getLocationId()),str(s.getStartedBy()),delta,delta,json.writeValueAsString(Map.of("mode","PREPAID_METERED","tariffId",s.getMeteredTariffId(),"price",s.getMeteredPrice(),"tariffSeconds",s.getMeteredTariffSeconds(),"unitSeconds",s.getBillingUnitSeconds(),"totalSeconds",seconds)),ts(cutoff),seconds);
            jdbc.update("INSERT INTO gaming_financial_operations (id,session_id,customer_id,resource_id,location_id,actor_id,kind,method,amount,currency,status,reference,created_at) VALUES (?,?,?,?,?,?,'PAYMENT','WALLET',?,'RSD','RECORDED',?,?)",
                op,str(s.getId()),str(s.getCustomerId()),str(s.getResourceId()),str(s.getLocationId()),str(s.getStartedBy()),delta,reference,ts(cutoff));
            jdbc.update("INSERT INTO gaming_wallet_ledger (id,customer_id,session_id,operation_id,amount,minutes,currency,kind,actor_id,created_at) VALUES (?,?,?,?,?,0,'RSD','SESSION_USE',?,?)",
                UUID.randomUUID().toString(),str(s.getCustomerId()),str(s.getId()),op,delta.negate(),str(s.getStartedBy()),ts(cutoff));
        }
        s.setBilledSeconds(seconds);s.setChargedAmount(total);s.setLastBilledAt(cutoff);
    }
    /** A credit increase can extend access, but never revive an expired lease or displace a booking. Customer is already locked. */
    private void refreshMeteredCoverage(UUID customer) {
        var s=sessions.findByCustomerIdAndStatus(customer,GamingSessionStatus.ACTIVE).filter(v->v.getBillingMode()==GamingBillingMode.PREPAID_METERED).orElse(null);
        if(s==null) return;
        resources.findLocked(s.getResourceId()).orElseThrow(()->error("Station not found"));
        entityManager.refresh(s,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        Instant now=clock.instant();
        if(s.getStatus()!=GamingSessionStatus.ACTIVE || !now.isBefore(s.getEndsAt()) || !now.isBefore(s.getMeteredLeaseUntil())) return;
        long funded=MeteredPricing.affordable(balance(customer).add(s.getChargedAmount()),s.getMeteredPrice(),s.getMeteredTariffSeconds(),s.getBillingUnitSeconds());
        Instant end=s.getStartedAt().plusSeconds(funded),previous=s.getEndsAt();
        if(!end.isAfter(previous)) return;
        var excluded=List.of(com.game_manager.gm.reservation.ReservationStatus.CANCELLED,com.game_manager.gm.reservation.ReservationStatus.REJECTED,com.game_manager.gm.reservation.ReservationStatus.COMPLETED);
        for(var booking:reservations.findResourceConflictingForUpdate(s.getResourceId(),previous,end,excluded,s.getReservationId()))
            if(booking.getStartTime().isBefore(end)) end=booking.getStartTime();
        if(!end.isAfter(previous)) return;
        s.setEndsAt(end);sessions.saveAndFlush(s);
        long sequence=stationCommands.write(s,com.game_manager.gm.gamingsession.command.StationCommandType.SESSION_EXTENDED);sessions.saveAndFlush(s);
        outbox.write(com.game_manager.gm.events.DomainEventType.GAMING_SESSION_EXTENDED,"GAMING_SESSION",s.getId(),Map.of("previousEndsAt",previous,"endsAt",end,"commandSequence",sequence));
    }
    private void requireNoMeteredDebit(UUID customer) {
        if(jdbc.queryForObject("SELECT COUNT(*) FROM gaming_sessions WHERE customer_id=? AND status='ACTIVE' AND billing_mode='PREPAID_METERED'",Integer.class,str(customer))>0) conflict("End the metered session before withdrawing or spending reserved coverage");
    }
    public Map<UUID,BigDecimal> balances(Collection<UUID> customers) {
        if(customers.isEmpty()) return Map.of();
        String placeholders=String.join(",",Collections.nCopies(customers.size(),"?"));
        Map<UUID,BigDecimal> result=new HashMap<>();
        jdbc.query("SELECT customer_id,SUM(amount) FROM gaming_wallet_ledger WHERE customer_id IN ("+placeholders+") GROUP BY customer_id",(org.springframework.jdbc.core.RowCallbackHandler)r->result.put(UUID.fromString(r.getString(1)),r.getBigDecimal(2)),customers.stream().map(UUID::toString).toArray());
        return result;
    }
    public BigDecimal availableCredit(UUID id) { return balance(id); }
    private BigDecimal balance(UUID id) { return jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM gaming_wallet_ledger WHERE customer_id=?",BigDecimal.class,str(id)); }
    private void ledger(UUID customer,UUID session,UUID pack,BigDecimal amount,int minutes,String kind,String reason) {
        ledger(customer,session,pack,amount,minutes,kind,reason,null);
    }
    private void ledger(UUID customer,UUID session,UUID pack,BigDecimal amount,int minutes,String kind,String reason,UUID operationId) {
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO gaming_wallet_ledger (id,customer_id,session_id,package_id,operation_id,amount,minutes,currency,kind,actor_id,reason,created_at) VALUES (?,?,?,?,?,?,?,'RSD',?,?,?,?)",
                str(id),str(customer),str(session),str(pack),str(operationId),amount,minutes,kind,str(current.requireCurrentUser().id()),reason,ts(clock.instant()));
        audit("GAMING_WALLET_"+kind,id,Map.of("customerId",customer,"amount",amount,"minutes",minutes),reason);
    }
    private UUID operation(UUID session,UUID customer,UUID resource,UUID location,String kind,Method method,BigDecimal amount,String reference,String reason,UUID original) {
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO gaming_financial_operations (id,session_id,customer_id,resource_id,location_id,actor_id,kind,method,amount,currency,status,reference,reason,original_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,'RSD','RECORDED',?,?,?,?)",
                str(id),str(session),str(customer),str(resource),str(location),str(current.requireCurrentUser().id()),kind,method.name(),amount,reference,reason,str(original),ts(clock.instant()));
        audit("GAMING_"+kind,id,Map.of("amount",amount,"method",method.name(),"status","RECORDED"),reason);return id;
    }
    private GamingSession lockSession(UUID id) {
        var ref=sessions.findById(id).orElseThrow(()->error("Session not found"));scope.requireResourceManagement(current.requireCurrentUser(),ref.getResourceId(),Permission.GAMING_PAYMENT_RECORD);
        // Customer first, then resource/session: same order as start and extension.
        if(ref.getCustomerId()!=null) lockLedgerCustomer(ref.getCustomerId());
        resources.findLocked(ref.getResourceId()).orElseThrow(()->error("Station not found"));
        UUID authorizedResource=ref.getResourceId();
        var locked=sessions.findByIdForUpdate(id).orElseThrow(()->error("Session not found"));
        entityManager.refresh(locked,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if(!authorizedResource.equals(locked.getResourceId())) conflict("Session moved; refresh before recording payment");
        return locked;
    }
    private void lockLedgerCustomer(UUID id) { users.findByIdForUpdate(id).filter(u->u.getRole()==Role.CUSTOMER).orElseThrow(()->error("Registered customer required")); }
    private void lockCustomer(UUID id) { users.findByIdForUpdate(id).filter(u->u.getRole()==Role.CUSTOMER && u.isActive() && !u.isDeleted()).orElseThrow(()->error("Active registered customer required")); }
    private PhysicalResource financialResource(UUID id) {scope.requireResourceManagement(current.requireCurrentUser(),id,Permission.GAMING_PAYMENT_RECORD);return resources.findById(id).orElseThrow(()->error("Station not found"));}
    private UUID location(PhysicalResource r) {return UUID.fromString(jdbc.queryForObject("SELECT location_id FROM areas WHERE id=?",String.class,str(r.getAreaId())));}
    private void externalOnly(Payment p) {if(p.method()!=Method.CASH && p.method()!=Method.EXTERNAL_POS) fail("Record cash or an external POS payment");externalReference(p);}
    private void externalReference(Payment p) {if(p.method()==Method.EXTERNAL_POS && (p.reference()==null || p.reference().isBlank())) fail("External POS receipt/reference is required; this system does not process bank payments");}
    private Tariff packageTariff(UUID id) {
        if(id==null) throw error("Choose a purchased time package");
        var snapshot=jdbc.query("SELECT snapshot FROM gaming_time_packages WHERE id=?",(r,n)->r.getString(1),str(id)).stream().findFirst().orElseThrow(()->error("Time package not found"));
        return json.readValue(snapshot,Tariff.class);
    }
    private Quote packageQuote(UUID resource,UUID id,int minutes,BigDecimal discount) {
        Tariff t=packageTariff(id);Policy p=policy();
        if(discount!=null && discount.signum()!=0) fail("A prepaid time package cannot receive another discount");
        if(minutes<p.minimumMinutes() || minutes>p.maximumMinutes()) fail("Duration is outside configured session limits");
        var station=resources.findById(resource).orElseThrow(()->error("Station not found"));
        if(t.serviceId()!=null && !t.serviceId().equals(station.getServiceId())) fail("Time package does not match the station category");
        var rows=jdbc.queryForList("SELECT expires_at FROM gaming_time_packages WHERE id=?",str(id));
        if(rows.getFirst().get("expires_at")!=null && !((Timestamp)rows.getFirst().get("expires_at")).toInstant().isAfter(clock.instant())) fail("Time package expired");
        Integer available=jdbc.queryForObject("SELECT COALESCE(SUM(minutes),0) FROM gaming_wallet_ledger WHERE package_id=?",Integer.class,str(id));
        if(available==null || available<minutes) fail("Insufficient package minutes");
        return new Quote(t.id(),t.version(),t.name(),minutes,ZERO,ZERO,ZERO,"RSD","PREPAID_TIME_PACKAGE; purchased category and price snapshot; exact minutes; no automatic unused-time refund");
    }
    private Tariff requireTariff(UUID id) {return jdbc.query("SELECT * FROM gaming_tariffs WHERE id=?",this::tariff,str(id)).stream().findFirst().orElseThrow(()->error("Tariff not found"));}
    private Tariff tariff(ResultSet r,int n) throws SQLException {return new Tariff(UUID.fromString(r.getString("id")),r.getString("name"),r.getString("service_id")==null?null:UUID.fromString(r.getString("service_id")),r.getInt("minutes"),r.getBigDecimal("price"),r.getString("currency"),r.getBoolean("active"),instant(r,"valid_from"),instant(r,"valid_until"),r.getInt("package_validity_days"),r.getLong("version"));}
    private void audit(String action,UUID id,Object value,String reason) {audit.write(action,"GAMING_FINANCE",id,null,Map.of("details",value),reason,AuditVisibility.MANAGEMENT);}
    private static Instant instant(ResultSet r,String column) throws SQLException {Timestamp t=r.getTimestamp(column);return t==null?null:t.toInstant();}
    private static Timestamp ts(Instant i) {return i==null?null:Timestamp.from(i);}
    private static String str(UUID id) {return id==null?null:id.toString();}
    private static String text(Object value) {return value==null?null:value.toString();}
    private static BigDecimal money(BigDecimal value) {if(value==null || value.precision()-value.scale()>12) throw error("Invalid monetary amount");try{return value.setScale(2,RoundingMode.UNNECESSARY);}catch(ArithmeticException e){throw error("Money must have at most two decimals");}}
    private static ApplicationException error(String message) {return new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,message);}
    private static void fail(String message) {throw error(message);}
    private static void conflict(String message) {throw new ApplicationException(HttpStatus.CONFLICT,message);}
    private static void forbidden(String message) {throw new ApplicationException(HttpStatus.FORBIDDEN,message);}
}
