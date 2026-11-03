package com.game_manager.gm.gamingsession.dto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.game_manager.gm.gamingsession.billing.GamingBillingDtos.Purchase;
public record ExtendGamingSessionRequest(@Positive int minutes,@NotNull Long version,@Valid Purchase purchase) {
    public ExtendGamingSessionRequest(int minutes,Long version) {this(minutes,version,null);}
}
