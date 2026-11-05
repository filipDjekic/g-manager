package com.game_manager.gm.machine;

import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Explicit resource UUID allowlist, effective exclusively in the local profile. */
@Component
public class DevelopmentStations {
    private final Environment environment;
    public DevelopmentStations(Environment environment) { this.environment=environment; }
    public boolean localEnvironment() {
        var profiles=Arrays.asList(environment.getActiveProfiles());
        return profiles.contains("local") && !profiles.contains("prod") && !profiles.contains("production");
    }
    public boolean enabled(UUID id) {
        if(!localEnvironment())return false;
        // Also support the .env imported as properties by a directly launched local backend.
        String ids=environment.getProperty("app.development.station-ids", "");
        if(ids.isBlank())ids=environment.getProperty("APP_DEVELOPMENT_STATION_IDS", "");
        if(ids.isBlank())ids=environment.getProperty("DEVELOPMENT_STATION_IDS", "");
        return Arrays.stream(ids.split(",")).map(String::trim).anyMatch(id.toString()::equalsIgnoreCase);
    }
    public String mode(UUID id) { return enabled(id)?"DEVELOPMENT":"PRODUCTION"; }
}
