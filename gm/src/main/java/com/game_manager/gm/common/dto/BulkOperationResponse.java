package com.game_manager.gm.common.dto;

import java.util.List;

public record BulkOperationResponse(int requested, int succeeded, int failed, List<BulkItemOutcome> outcomes) {}
