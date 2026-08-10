package com.game_manager.gm.ai.dto;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.NotNull;
public record AiFeedbackRequest(@NotNull @Pattern(regexp="ACCEPTED|REJECTED|CORRECTED") String feedback) {}
