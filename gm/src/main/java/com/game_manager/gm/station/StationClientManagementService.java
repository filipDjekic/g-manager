package com.game_manager.gm.station;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.scheduling.ClientStatePort;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class StationClientManagementService {
    private final ClientStatePort heartbeats;
    private final GamingStationProfileRepository stations;
    private final Clock clock;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('STATION_READ')")
    public ClientManagementStatus status(UUID resourceId) {
        GamingStationProfile station = stations.findByResourceId(resourceId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Station not found"));
        return heartbeats.heartbeat(resourceId).map(value -> new ClientManagementStatus(
                value.clientVersion(), value.lastSeenAt(),
                value.lastSeenAt().plusSeconds(station.getOfflineGraceSeconds()).isAfter(clock.instant()),
                value.installationStatus(), value.updateStatus(), value.maintenanceActive(),
                value.clientErrorCode())).orElseGet(() -> new ClientManagementStatus(
                station.getClientVersion(), station.getLastHeartbeatAt(), false, null, null, null, null));
    }

    public record ClientManagementStatus(String clientVersion, Instant lastHeartbeatAt, boolean online,
            String installationStatus, String updateStatus, Boolean maintenanceActive, String errorCode) {}
}
