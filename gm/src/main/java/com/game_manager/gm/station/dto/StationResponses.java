package com.game_manager.gm.station.dto;

import com.game_manager.gm.station.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class StationResponses {
    private StationResponses() {}

    public record DefinitionView(UUID id, String code, String name, ApplicationType type,
            String executablePath, String publisher, String executableSha256,
            String publisherCertificateThumbprint, String minimumFileVersion,
            String defaultArguments, boolean active, Long version) {
        public static DefinitionView from(ApplicationDefinition value) {
            return new DefinitionView(value.getId(), value.getCode(), value.getName(), value.getType(),
                    value.getExecutablePath(), value.getPublisher(), value.getExecutableSha256(),
                    value.getPublisherCertificateThumbprint(), value.getMinimumFileVersion(),
                    value.getDefaultArguments(), value.isActive(), value.getVersion());
        }
    }

    public record ProfileEntryView(UUID id, UUID applicationDefinitionId, String applicationName,
            ApplicationType applicationType, boolean requiredProcess, boolean autoStart,
            int launchOrder, String argumentsOverride, String dependencyGroup, Long version) {}

    public record ProfileView(UUID id, String code, String name, String description, boolean active,
            long configurationVersion, Long version, List<ProfileEntryView> entries) {}

    public record StationOverview(UUID stationProfileId, UUID resourceId, String resourceCode,
            String resourceName, UUID areaId, UUID locationId,
            StationOperationalStatus operationalStatus, StationEffectiveStatus effectiveStatus,
            UUID applicationProfileId, String applicationProfileName, long configurationVersion,
            boolean clientEnabled, int heartbeatIntervalSeconds, int offlineGraceSeconds,
            Instant lastHeartbeatAt, String clientVersion, UUID activeSessionId, Long version) {}
}
