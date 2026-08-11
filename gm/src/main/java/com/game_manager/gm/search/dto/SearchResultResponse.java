package com.game_manager.gm.search.dto;

import com.game_manager.gm.common.search.SearchResourceType;
import com.game_manager.gm.common.web.NavigationActionResponse;

import java.util.UUID;

public record SearchResultResponse(
        SearchResourceType type, UUID id, String title, String subtitle, String url,
        NavigationActionResponse action, boolean favorite
) {}
