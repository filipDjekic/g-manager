package com.game_manager.gm.waitlist.dto;
import jakarta.validation.constraints.*;
public record CancelWaitlistRequest(@NotNull @Min(0) Long version, @NotBlank @Size(max=500) String reason) {}
