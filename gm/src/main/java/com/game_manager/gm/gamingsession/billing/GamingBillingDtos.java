package com.game_manager.gm.gamingsession.billing;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class GamingBillingDtos {
    private GamingBillingDtos() {}
    public enum Method { CASH, EXTERNAL_POS, WALLET, TIME_PACKAGE }
    public record Payment(@NotNull Method method, @NotNull @DecimalMin("0.00") @Digits(integer=12,fraction=2) BigDecimal amount,
            @Size(max=160) String reference) {}
    public record Purchase(@NotNull UUID tariffId, @NotNull Long tariffVersion,
            @DecimalMin("0") @DecimalMax("100") @Digits(integer=3,fraction=2) BigDecimal discountPercent,
            @Size(max=500) String reason, @NotNull @Valid Payment payment, UUID packageId) {}
    public record Tariff(UUID id, String name, UUID serviceId, int minutes, BigDecimal price, String currency,
            boolean active, Instant validFrom, Instant validUntil, int packageValidityDays, long version) {}
    public record TariffInput(@NotBlank @Size(max=120) String name, UUID serviceId,
            @Min(1) @Max(1440) int minutes, @NotNull @DecimalMin("0.01") @Digits(integer=12,fraction=2) BigDecimal price,
            boolean active, Instant validFrom, Instant validUntil, @Min(0) @Max(3650) int packageValidityDays,
            @NotNull Long version) {}
    public record Policy(boolean allowPartialPayment, boolean allowDebt, boolean allowRefunds,
            @Min(1) @Max(1440) int minimumMinutes, @Min(1) @Max(1440) int maximumMinutes,
            @NotNull @DecimalMin("0") @DecimalMax("100") @Digits(integer=3,fraction=2) BigDecimal employeeDiscountLimit, long version) {}
    public record Quote(UUID tariffId, long tariffVersion, String tariffName, int minutes, BigDecimal gross,
            BigDecimal discount, BigDecimal total, String currency, String rule) {}
    public record Settlement(@NotNull @Valid Payment payment, @Size(max=500) String reason) {}
    public record Refund(@NotNull UUID paymentId, @NotNull @DecimalMin("0.01") @Digits(integer=12,fraction=2) BigDecimal amount,
            @NotBlank @Size(max=500) String reason) {}
    public record WalletChange(@NotNull UUID resourceId, @NotNull @Valid Payment payment, @NotBlank @Size(max=500) String reason) {}
    public record PackagePurchase(@NotNull UUID resourceId, @NotNull UUID tariffId, @NotNull Long tariffVersion,
            @NotNull @Valid Payment payment) {}
    public record CreditAdjustment(@NotNull UUID resourceId, @NotNull @Digits(integer=12,fraction=2) BigDecimal amount,
            @NotBlank @Size(max=500) String reason) {}
}
