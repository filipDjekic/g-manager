package com.game_manager.gm.common.web;

import com.game_manager.gm.common.search.SearchResourceType;

public record NavigationActionResponse(String kind, String label, String url) {
    public static NavigationActionResponse navigate(String label, String url) {
        return new NavigationActionResponse("NAVIGATE", label, url);
    }

    public static NavigationActionResponse forResource(SearchResourceType type, String url) {
        String label = switch (type) {
            case CATALOG -> "Otvori stavku kataloga";
            case USER -> "Otvori korisnika";
            case ORDER -> "Otvori narudžbinu";
            case RESERVATION -> "Otvori rezervaciju";
        };
        return navigate(label, url);
    }
}
