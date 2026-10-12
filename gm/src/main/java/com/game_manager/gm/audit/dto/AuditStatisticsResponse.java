package com.game_manager.gm.audit.dto;

import java.util.List;

public record AuditStatisticsResponse(long total, long created, long updated, long removed,
        List<String> creationActions, List<String> updateActions, List<String> removalActions) {}
