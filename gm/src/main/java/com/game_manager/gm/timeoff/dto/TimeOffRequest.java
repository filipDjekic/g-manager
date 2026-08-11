package com.game_manager.gm.timeoff.dto;
import jakarta.validation.constraints.*; import java.time.Instant; import java.util.UUID;
public record TimeOffRequest(@NotNull UUID employeeId,@NotNull Instant startsAt,@NotNull Instant endsAt,@NotBlank @Size(max=500) String reason){}
