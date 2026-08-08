package com.game_manager.gm.auth;

public record SessionRequestMetadata(String deviceLabel, String userAgentSummary, String ipHash) {
}
