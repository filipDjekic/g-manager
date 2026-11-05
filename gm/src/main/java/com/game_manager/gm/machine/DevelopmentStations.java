package com.game_manager.gm.machine;

import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Explicit station allowlist, effective exclusively in the local profile. */
@Component
public class DevelopmentStations {
    private final Environment environment;
    public DevelopmentStations(Environment environment) { this.environment=environment; }
    public boolean enabled(UUID id) {
        var profiles=Arrays.asList(environment.getActiveProfiles());
        return profiles.contains("local") && !profiles.contains("prod") && !profiles.contains("production")
            && Arrays.stream(environment.getProperty("app.development.station-ids", "").split(","))
                .map(String::trim).anyMatch(id.toString()::equalsIgnoreCase);
    }
}
