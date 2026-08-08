package com.game_manager.gm.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DeletionReasonRequest(@NotBlank @Size(max = 500) String reason) {
}
