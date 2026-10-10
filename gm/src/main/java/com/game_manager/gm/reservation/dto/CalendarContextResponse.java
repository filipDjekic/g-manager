package com.game_manager.gm.reservation.dto;

import com.game_manager.gm.resource.ResourceType;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Anonymous occupancy and current resource state, independent of event visibility filters. */
public record CalendarContextResponse(String timezone, Instant serverTime, Instant rangeStart, Instant rangeEnd,
        List<LocationHours> locations, List<Zone> areas, List<ResourceRow> resources,
        List<Occupancy> occupancy, List<EmployeeBlock> employeeBlocks, long occupiedStations) {
    public record Window(Instant startTime, Instant endTime) {}
    public record LocationHours(UUID id, String name, List<Window> windows) {}
    public record Zone(UUID id, UUID locationId, String locationName, String name, boolean active, int displayOrder) {}
    public record ResourceRow(UUID id, String code, String name, ResourceType type,
            UUID locationId, String locationName, UUID areaId, String areaName,
            boolean canManage, String currentRestriction) {}
    public record Occupancy(UUID resourceId, Instant startTime, Instant endTime, String kind) {}
    public record EmployeeBlock(Instant startTime, Instant endTime, String kind) {}
}
