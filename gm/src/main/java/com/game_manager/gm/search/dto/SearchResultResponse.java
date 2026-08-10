package com.game_manager.gm.search.dto;

import com.game_manager.gm.common.search.SearchResourceType;

import java.util.UUID;

public record SearchResultResponse(
        SearchResourceType type, UUID id, String title, String subtitle, String url, boolean favorite
) {}
