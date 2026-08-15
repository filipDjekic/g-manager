package com.game_manager.gm.station;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.resource.*;
import com.game_manager.gm.station.dto.*;
import com.game_manager.gm.station.dto.StationResponses.*;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class StationReadinessService {
    private final PhysicalResourceRepository resources;
    private final AreaRepository areas;
    private final GamingStationProfileRepository stations;
    private final ApplicationDefinitionRepository definitions;
    private final ApplicationProfileRepository profiles;
    private final ApplicationProfileEntryRepository entries;
    private final StationRuntimeProjectionPort runtimeProjection;
    private final Clock clock;
    private final AuditWriter audit;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('STATION_READ')")
    public List<StationOverview> overview() {
        List<PhysicalResource> pcs = resources.findByTypeOrderByNameAsc(ResourceType.GAMING_PC);
        Map<UUID, GamingStationProfile> stationByResource = stations.findByResourceIdIn(
                pcs.stream().map(PhysicalResource::getId).toList()).stream()
                .collect(Collectors.toMap(GamingStationProfile::getResourceId, Function.identity()));
        Map<UUID, Area> areaById = areas.findAllById(pcs.stream().map(PhysicalResource::getAreaId).toList())
                .stream().collect(Collectors.toMap(Area::getId, Function.identity()));
        Map<UUID, ApplicationProfile> profileById = profiles.findAllById(stationByResource.values().stream()
                        .map(GamingStationProfile::getApplicationProfileId).filter(Objects::nonNull).toList())
                .stream().collect(Collectors.toMap(ApplicationProfile::getId, Function.identity()));
        Map<UUID, UUID> activeSessions = runtimeProjection.activeSessionIdsByResource();
        Instant now = clock.instant();
        return pcs.stream().map(resource -> {
            GamingStationProfile station = stationByResource.get(resource.getId());
            Area area = areaById.get(resource.getAreaId());
            ApplicationProfile profile = station == null ? null : profileById.get(station.getApplicationProfileId());
            UUID activeSessionId = activeSessions.get(resource.getId());
            StationOperationalStatus operational = station == null
                    ? StationOperationalStatus.AVAILABLE : station.getOperationalStatus();
            return new StationOverview(station == null ? null : station.getId(), resource.getId(),
                    resource.getCode(), resource.getName(), resource.getAreaId(), area.getLocationId(),
                    operational, effectiveStatus(station, operational, activeSessionId, now),
                    profile == null ? null : profile.getId(), profile == null ? null : profile.getName(),
                    profile == null ? 0 : profile.getConfigurationVersion(), station != null && station.isClientEnabled(),
                    station == null ? 10 : station.getHeartbeatIntervalSeconds(),
                    station == null ? 60 : station.getOfflineGraceSeconds(),
                    station == null ? null : station.getLastHeartbeatAt(), station == null ? null : station.getClientVersion(),
                    activeSessionId, station == null ? null : station.getVersion());
        }).toList();
    }

    @Transactional(readOnly = true)
    public void requireReadyForSession(UUID resourceId) {
        GamingStationProfile station = stations.findByResourceId(resourceId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Gaming station is not configured"));
        if (station.getOperationalStatus() != StationOperationalStatus.AVAILABLE)
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Gaming station is not available");
        if (station.isClientEnabled() && (station.getLastHeartbeatAt() == null
                || !station.getLastHeartbeatAt().plusSeconds(station.getOfflineGraceSeconds()).isAfter(clock.instant())))
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Gaming station client is offline");
        if (station.getApplicationProfileId() == null)
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Gaming station has no application profile");
        requireActiveProfile(station.getApplicationProfileId());
    }

    @Transactional
    @PreAuthorize("hasAuthority('STATION_MAINTENANCE')")
    public StationOverview saveStation(UUID resourceId, StationProfileRequest request) {
        PhysicalResource resource = requirePc(resourceId);
        GamingStationProfile station = stations.findByResourceId(resourceId).orElse(null);
        if (station == null) {
            if (request.version() != null) conflict();
            station = new GamingStationProfile(); station.setResourceId(resourceId);
        } else {
            version(station.getVersion(), request.version());
            if (station.getOperationalStatus() == StationOperationalStatus.RETIRED
                    && request.operationalStatus() != StationOperationalStatus.RETIRED)
                throw new ApplicationException(HttpStatus.CONFLICT, "A retired station cannot be reactivated");
        }
        ApplicationProfile profile = request.applicationProfileId() == null ? null
                : requireActiveProfile(request.applicationProfileId());
        if (request.clientEnabled() && profile == null)
            throw new ApplicationException(HttpStatus.BAD_REQUEST,
                    "A client-enabled station requires an active application profile");
        station.setOperationalStatus(request.operationalStatus());
        station.setApplicationProfileId(profile == null ? null : profile.getId());
        station.setClientEnabled(request.clientEnabled());
        station.setHeartbeatIntervalSeconds(request.heartbeatIntervalSeconds());
        station.setOfflineGraceSeconds(request.offlineGraceSeconds());
        station = stations.saveAndFlush(station);
        audit.write("STATION_PROFILE_UPDATED", "PHYSICAL_RESOURCE", resourceId, null,
                Map.of("operationalStatus", station.getOperationalStatus().name(),
                        "clientEnabled", station.isClientEnabled()), null, AuditVisibility.MANAGEMENT);
        return overviewFor(resource, station, profile);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('STATION_READ')")
    public List<DefinitionView> definitions() {
        return definitions.findAllByOrderByNameAsc().stream().map(DefinitionView::from).toList();
    }

    @Transactional
    @PreAuthorize("hasAuthority('APPLICATION_PROFILE_MANAGE')")
    public DefinitionView createDefinition(ApplicationDefinitionRequest request) {
        validateDefinition(request, null); ApplicationDefinition value = new ApplicationDefinition();
        apply(value, request); value = definitions.saveAndFlush(value);
        audit.write("APPLICATION_DEFINITION_CREATED", "APPLICATION_DEFINITION", value.getId(), null,
                Map.of("code", value.getCode(), "type", value.getType().name()), null, AuditVisibility.MANAGEMENT);
        return DefinitionView.from(value);
    }

    @Transactional
    @PreAuthorize("hasAuthority('APPLICATION_PROFILE_MANAGE')")
    public DefinitionView updateDefinition(UUID id, ApplicationDefinitionRequest request) {
        ApplicationDefinition value = definition(id); version(value.getVersion(), request.version());
        validateDefinition(request, id); apply(value, request);
        value = definitions.saveAndFlush(value);
        audit.write("APPLICATION_DEFINITION_UPDATED", "APPLICATION_DEFINITION", value.getId(), null,
                Map.of("code", value.getCode(), "type", value.getType().name()), null, AuditVisibility.MANAGEMENT);
        return DefinitionView.from(value);
    }

    @Transactional
    @PreAuthorize("hasAuthority('APPLICATION_PROFILE_MANAGE')")
    public void deleteDefinition(UUID id, long expectedVersion) {
        ApplicationDefinition value = definition(id); version(value.getVersion(), expectedVersion);
        if (entries.existsByApplicationDefinitionId(id))
            throw new ApplicationException(HttpStatus.CONFLICT, "Application is used by a profile");
        definitions.delete(value);
        audit.write("APPLICATION_DEFINITION_DELETED", "APPLICATION_DEFINITION", id,
                Map.of("code", value.getCode()), null, null, AuditVisibility.MANAGEMENT);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('STATION_READ')")
    public List<ProfileView> profiles() {
        List<ApplicationProfile> values = profiles.findAllByOrderByNameAsc();
        Map<UUID, ApplicationDefinition> definitionsById = definitions.findAll().stream()
                .collect(Collectors.toMap(ApplicationDefinition::getId, Function.identity()));
        Map<UUID, List<ApplicationProfileEntry>> byProfile = entries.findByProfileIdInOrderByLaunchOrderAscIdAsc(
                        values.stream().map(ApplicationProfile::getId).toList()).stream()
                .collect(Collectors.groupingBy(ApplicationProfileEntry::getProfileId));
        return values.stream().map(value -> view(value, byProfile.getOrDefault(value.getId(), List.of()), definitionsById)).toList();
    }

    @Transactional
    @PreAuthorize("hasAuthority('APPLICATION_PROFILE_MANAGE')")
    public ProfileView createProfile(ApplicationProfileRequest request) {
        validateProfile(request, null); ApplicationProfile profile = new ApplicationProfile();
        apply(profile, request); profile = profiles.saveAndFlush(profile);
        ProfileView result = replaceEntries(profile, request.entries());
        audit.write("APPLICATION_PROFILE_CREATED", "APPLICATION_PROFILE", profile.getId(), null,
                Map.of("code", profile.getCode(), "configurationVersion", profile.getConfigurationVersion()),
                null, AuditVisibility.MANAGEMENT); return result;
    }

    @Transactional
    @PreAuthorize("hasAuthority('APPLICATION_PROFILE_MANAGE')")
    public ProfileView updateProfile(UUID id, ApplicationProfileRequest request) {
        ApplicationProfile profile = profile(id); version(profile.getVersion(), request.version());
        validateProfile(request, id); apply(profile, request);
        profile.setConfigurationVersion(profile.getConfigurationVersion() + 1);
        profiles.saveAndFlush(profile); ProfileView result = replaceEntries(profile, request.entries());
        audit.write("APPLICATION_PROFILE_UPDATED", "APPLICATION_PROFILE", profile.getId(), null,
                Map.of("code", profile.getCode(), "configurationVersion", profile.getConfigurationVersion()),
                null, AuditVisibility.MANAGEMENT); return result;
    }

    @Transactional
    @PreAuthorize("hasAuthority('APPLICATION_PROFILE_MANAGE')")
    public void deleteProfile(UUID id, long expectedVersion) {
        ApplicationProfile value = profile(id); version(value.getVersion(), expectedVersion);
        if (stations.existsByApplicationProfileId(id))
            throw new ApplicationException(HttpStatus.CONFLICT, "Application profile is assigned to a station");
        entries.deleteByProfileId(id); profiles.delete(value);
        audit.write("APPLICATION_PROFILE_DELETED", "APPLICATION_PROFILE", id,
                Map.of("code", value.getCode()), null, null, AuditVisibility.MANAGEMENT);
    }

    private ProfileView replaceEntries(ApplicationProfile profile, List<ApplicationProfileRequest.Entry> requested) {
        entries.deleteByProfileId(profile.getId()); entries.flush();
        Map<UUID, ApplicationDefinition> byId = definitions.findAllById(requested.stream()
                .map(ApplicationProfileRequest.Entry::applicationDefinitionId).toList()).stream()
                .collect(Collectors.toMap(ApplicationDefinition::getId, Function.identity()));
        List<ApplicationProfileEntry> saved = requested.stream().map(item -> {
            ApplicationProfileEntry value = new ApplicationProfileEntry(); value.setProfileId(profile.getId());
            value.setApplicationDefinitionId(item.applicationDefinitionId()); value.setRequiredProcess(item.requiredProcess());
            value.setAutoStart(item.autoStart()); value.setLaunchOrder(item.launchOrder());
            value.setArgumentsOverride(trim(item.argumentsOverride())); return entries.save(value);
        }).toList(); entries.flush(); return view(profile, saved, byId);
    }

    private void validateDefinition(ApplicationDefinitionRequest request, UUID id) {
        if (definitions.existsByCodeIgnoreCaseAndIdNot(request.code().trim(), id == null ? new UUID(0, 0) : id))
            throw new ApplicationException(HttpStatus.CONFLICT, "Application code is already in use");
        String path = request.executablePath().trim();
        if (!path.matches("(?i)^[a-z]:\\\\.+\\.exe$") || path.contains("*") || path.contains("?"))
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Executable path must be an absolute Windows .exe path");
        if ((request.publisher() == null || request.publisher().isBlank())
                && (request.executableSha256() == null || request.executableSha256().isBlank()))
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Publisher or executable SHA-256 is required");
    }

    private void validateProfile(ApplicationProfileRequest request, UUID id) {
        if (profiles.existsByCodeIgnoreCaseAndIdNot(request.code().trim(), id == null ? new UUID(0, 0) : id))
            throw new ApplicationException(HttpStatus.CONFLICT, "Application profile code is already in use");
        Set<UUID> ids = new HashSet<>();
        if (request.entries().stream().anyMatch(entry -> !ids.add(entry.applicationDefinitionId())))
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Application profile contains duplicate entries");
        List<ApplicationDefinition> selected = definitions.findAllById(ids);
        if (selected.size() != ids.size() || selected.stream().anyMatch(value -> !value.isActive()))
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Profile references an unavailable application");
        if (selected.stream().noneMatch(value -> value.getType() == ApplicationType.GAME))
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Application profile must include at least one game");
    }

    private StationOverview overviewFor(PhysicalResource resource, GamingStationProfile station, ApplicationProfile profile) {
        Area area = areas.findById(resource.getAreaId()).orElseThrow();
        UUID activeSessionId = runtimeProjection.activeSessionIdsByResource().get(resource.getId());
        return new StationOverview(station.getId(), resource.getId(), resource.getCode(), resource.getName(), resource.getAreaId(),
                area.getLocationId(), station.getOperationalStatus(), effectiveStatus(station, station.getOperationalStatus(), activeSessionId, clock.instant()),
                profile == null ? null : profile.getId(), profile == null ? null : profile.getName(), profile == null ? 0 : profile.getConfigurationVersion(),
                station.isClientEnabled(), station.getHeartbeatIntervalSeconds(), station.getOfflineGraceSeconds(), station.getLastHeartbeatAt(),
                station.getClientVersion(), activeSessionId, station.getVersion());
    }

    private static StationEffectiveStatus effectiveStatus(GamingStationProfile station, StationOperationalStatus operational,
            UUID activeSessionId, Instant now) {
        if (operational != StationOperationalStatus.AVAILABLE) return StationEffectiveStatus.valueOf(operational.name());
        if (activeSessionId != null) return StationEffectiveStatus.IN_SESSION;
        if (station != null && station.isClientEnabled() && (station.getLastHeartbeatAt() == null
                || !station.getLastHeartbeatAt().plusSeconds(station.getOfflineGraceSeconds()).isAfter(now)))
            return StationEffectiveStatus.OFFLINE;
        return StationEffectiveStatus.AVAILABLE;
    }

    private PhysicalResource requirePc(UUID id) { PhysicalResource value = resources.findById(id)
            .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Gaming station not found"));
        if (value.getType() != ResourceType.GAMING_PC) throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,
                "Only a gaming PC can have a station profile"); return value; }
    private ApplicationProfile requireActiveProfile(UUID id) { ApplicationProfile value = profile(id);
        if (!value.isActive()) throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY, "Application profile is inactive"); return value; }
    private ApplicationProfile profile(UUID id) { return profiles.findById(id).orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Application profile not found")); }
    private ApplicationDefinition definition(UUID id) { return definitions.findById(id).orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Application definition not found")); }
    private static void version(Long actual, Long expected) { if (expected == null || !actual.equals(expected)) conflict(); }
    private static void conflict() { throw new ApplicationException(HttpStatus.CONFLICT, "Configuration was changed; refresh and try again"); }
    private static void apply(ApplicationDefinition value, ApplicationDefinitionRequest request) { value.setCode(request.code().trim()); value.setName(request.name().trim()); value.setType(request.type()); value.setExecutablePath(request.executablePath().trim()); value.setPublisher(trim(request.publisher())); value.setExecutableSha256(request.executableSha256() == null ? null : request.executableSha256().toLowerCase(Locale.ROOT)); value.setDefaultArguments(trim(request.defaultArguments())); value.setActive(request.active()); }
    private static void apply(ApplicationProfile value, ApplicationProfileRequest request) { value.setCode(request.code().trim()); value.setName(request.name().trim()); value.setDescription(trim(request.description())); value.setActive(request.active()); }
    private static ProfileView view(ApplicationProfile profile, List<ApplicationProfileEntry> values, Map<UUID, ApplicationDefinition> byId) { return new ProfileView(profile.getId(), profile.getCode(), profile.getName(), profile.getDescription(), profile.isActive(), profile.getConfigurationVersion(), profile.getVersion(), values.stream().map(value -> { ApplicationDefinition definition = byId.get(value.getApplicationDefinitionId()); return new ProfileEntryView(value.getId(), value.getApplicationDefinitionId(), definition.getName(), definition.getType(), value.isRequiredProcess(), value.isAutoStart(), value.getLaunchOrder(), value.getArgumentsOverride(), value.getVersion()); }).toList()); }
    private static String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
