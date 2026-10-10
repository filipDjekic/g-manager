package com.game_manager.gm.resource.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public final class FloorPlanDtos {
    private FloorPlanDtos() {}

    public record Room(@NotBlank @Size(max = 80) String id,
            @NotBlank @Size(max = 120) String label, UUID areaId,
            double x, double y, double width, double height) {}

    public record Wall(@NotBlank @Size(max = 80) String id,
            double x1, double y1, double x2, double y2, double thickness) {}

    public enum DoorKind { DOOR, PASSAGE }
    public record Door(@NotBlank @Size(max = 80) String id, @NotNull DoorKind kind,
            double x1, double y1, double x2, double y2) {}

    public record Geometry(@NotNull @Size(max = 500) List<@NotNull @Valid Room> rooms,
            @NotNull @Size(max = 2000) List<@NotNull @Valid Wall> walls,
            @NotNull @Size(max = 1000) List<@NotNull @Valid Door> doors) {
        public static Geometry empty() { return new Geometry(List.of(), List.of(), List.of()); }
    }

    // Resource positions remain in their existing Area's coordinate system.
    public record ResourcePosition(@NotNull UUID id, @NotNull @Min(0) Long version,
            @Min(0) int x, @Min(0) int y, @Min(1) int width, @Min(1) int height, int rotation) {}
    public record AreaVersion(@NotNull UUID id, @NotNull @Min(0) Long version) {}

    public record SaveRequest(@NotNull @Min(-1) Long version, @NotNull @Valid Geometry geometry,
            @NotNull @Size(max = 500) List<@NotNull @Valid AreaVersion> areaVersions,
            @NotNull @Size(max = 2000) List<@NotNull @Valid ResourcePosition> resourcePositions) {}

    // -1 represents a location that has no persisted floor plan yet.
    public record View(UUID locationId, long version, Geometry geometry) {}
    public record SaveResult(UUID locationId, long version, Geometry geometry, List<ResourcePosition> resourcePositions) {}
}
