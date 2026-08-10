package com.game_manager.gm.common.search;

import java.util.UUID;

public record SearchEntry(
        SearchResourceType type, UUID id, String title, String subtitle, String url, int rank
) {}
