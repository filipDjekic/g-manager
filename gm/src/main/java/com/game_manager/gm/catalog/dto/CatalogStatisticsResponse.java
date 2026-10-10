package com.game_manager.gm.catalog.dto;

public record CatalogStatisticsResponse(long serviceCount, long activeServiceCount,
        long productCount, Long inactiveCount, boolean administrative, long maxImageBytes) {
}
