package com.game_manager.gm.gamingsession.dto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import com.game_manager.gm.gamingsession.billing.GamingBillingDtos.Purchase;
public record StartGamingSessionRequest(UUID customerId, @NotNull UUID resourceId, UUID reservationId,
        @Positive Integer durationMinutes, @Size(max=120) String guestName, @Valid Purchase purchase, com.game_manager.gm.gamingsession.GamingBillingMode billingMode, UUID meteredTariffId) {
    public StartGamingSessionRequest(UUID c,UUID r,UUID reservation,Integer minutes,String guest,Purchase purchase) { this(c,r,reservation,minutes,guest,purchase,null,null); }
    public StartGamingSessionRequest(UUID customerId,UUID resourceId,UUID reservationId,Integer durationMinutes) {
        this(customerId,resourceId,reservationId,durationMinutes,null,null,null,null);
    }
}
