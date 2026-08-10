package com.game_manager.gm.savedview.dto;

import com.game_manager.gm.savedview.SavedViewResourceType;

import java.util.Map;
import java.util.UUID;

public record SavedViewResponse(
        UUID id, SavedViewResourceType resourceType, String name,
        Map<String, String> query, long version
) {}
