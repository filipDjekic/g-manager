package com.game_manager.gm.timeoff.dto;
import com.game_manager.gm.timeoff.TimeOffStatus; import jakarta.validation.constraints.*;
public record TimeOffDecisionRequest(@NotNull TimeOffStatus status,@NotNull Long version,@Size(max=500) String reason){}
