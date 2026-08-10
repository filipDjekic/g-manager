package com.game_manager.gm.common.dto;

import java.util.UUID;

public record BulkItemOutcome(UUID id, boolean success, String message) {}
