package com.game_manager.gm.feature;

import java.time.LocalDate;

public enum FeatureFlag {
    REPORTS(true, "Operations", LocalDate.of(2027, 2, 1)),
    WORKFLOWS(true, "Product", LocalDate.of(2027, 2, 1)),
    PWA_OFFLINE(true, "Platform", LocalDate.of(2027, 2, 1)),
    AI_ASSISTANT(false, "Security", LocalDate.of(2026, 12, 1));

    private final boolean defaultEnabled;
    private final String owner;
    private final LocalDate reviewBy;

    FeatureFlag(boolean defaultEnabled, String owner, LocalDate reviewBy) {
        this.defaultEnabled = defaultEnabled;
        this.owner = owner;
        this.reviewBy = reviewBy;
    }

    public boolean defaultEnabled() {
        return defaultEnabled;
    }

    public String owner() {
        return owner;
    }

    public LocalDate reviewBy() {
        return reviewBy;
    }
}
