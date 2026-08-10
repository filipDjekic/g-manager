package com.game_manager.gm.search.dto;

import java.util.List;

public record SearchResponse(List<SearchResultResponse> results, int limit) {}
