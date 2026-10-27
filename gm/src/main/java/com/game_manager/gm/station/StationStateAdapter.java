package com.game_manager.gm.station;

import com.game_manager.gm.common.scheduling.StationStatePort;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class StationStateAdapter implements StationStatePort {
    private final GamingStationProfileRepository profiles;

    @Override
    public Map<UUID, String> operationalStates(Collection<UUID> ids) {
        return ids.isEmpty() ? Map.of() : profiles.findByResourceIdIn(ids).stream()
                .collect(Collectors.toMap(GamingStationProfile::getResourceId, value -> value.getOperationalStatus().name()));
    }
}
