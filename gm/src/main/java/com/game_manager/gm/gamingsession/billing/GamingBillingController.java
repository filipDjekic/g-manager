package com.game_manager.gm.gamingsession.billing;
import static com.game_manager.gm.gamingsession.billing.GamingBillingDtos.*;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/gaming-billing") @RequiredArgsConstructor
public class GamingBillingController {
    private final GamingBillingService service;
    private final GamingFinanceReportService reports;
    @GetMapping("/tariffs") public List<Tariff> tariffs(){return service.tariffs();}
    @PostMapping("/tariffs") public Tariff create(@Valid @RequestBody TariffInput r){return service.saveTariff(null,r);}
    @PutMapping("/tariffs/{id}") public Tariff update(@PathVariable UUID id,@Valid @RequestBody TariffInput r){return service.saveTariff(id,r);}
    @GetMapping("/policy") public Policy policy(){return service.policy();}
    @PutMapping("/policy") public Policy policy(@Valid @RequestBody Policy r){return service.savePolicy(r);}
    @GetMapping("/quote") public Quote quote(@RequestParam UUID resourceId,@RequestParam(required=false) UUID tariffId,@RequestParam int minutes,@RequestParam(defaultValue="0") BigDecimal discount,@RequestParam(required=false) UUID packageId){return service.quote(resourceId,tariffId,minutes,discount,packageId);}
    @GetMapping("/sessions/{id}") public Map<String,Object> account(@PathVariable UUID id){return service.account(id);}
    @PostMapping("/sessions/{id}/payments") public Map<String,Object> pay(@PathVariable UUID id,@Valid @RequestBody Settlement r){return service.pay(id,r);}
    @PostMapping("/sessions/{id}/refunds") public Map<String,Object> refund(@PathVariable UUID id,@Valid @RequestBody Refund r){return service.refund(id,r);}
    @GetMapping("/customers/{id}") public Map<String,Object> wallet(@PathVariable UUID id){return service.wallet(id);}
    @PostMapping("/customers/{id}/topups") public Map<String,Object> topup(@PathVariable UUID id,@Valid @RequestBody WalletChange r){return service.topup(id,r);}
    @PostMapping("/customers/{id}/packages") public Map<String,Object> pack(@PathVariable UUID id,@Valid @RequestBody PackagePurchase r){return service.buyPackage(id,r);}
    @PostMapping("/customers/{id}/adjustments") public Map<String,Object> adjust(@PathVariable UUID id,@Valid @RequestBody CreditAdjustment r){return service.adjust(id,r);}
    @PostMapping("/customers/{id}/refunds") public Map<String,Object> walletRefund(@PathVariable UUID id,@Valid @RequestBody Refund r){return service.refundWallet(id,r);}
    @GetMapping("/report") public Map<String,Object> report(@RequestParam java.time.Instant from,@RequestParam java.time.Instant until){return reports.report(from,until);}
}
