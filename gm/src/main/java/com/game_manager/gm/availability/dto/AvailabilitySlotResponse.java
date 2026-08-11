package com.game_manager.gm.availability.dto;

import java.time.Instant;

public record AvailabilitySlotResponse(Instant startTime, Instant endTime) {}
