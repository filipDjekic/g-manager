package com.game_manager.gm.resource;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.resource.dto.FloorPlanDtos.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service @RequiredArgsConstructor
public class LocationFloorPlanService {
    private final LocationFloorPlanRepository plans;
    private final LocationRepository locations;
    private final AreaRepository areas;
    private final PhysicalResourceRepository resources;
    private final EntityManager entityManager;
    private final ObjectMapper mapper;

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESOURCE_READ')")
    public View load(UUID locationId) {
        if (!locations.existsById(locationId)) throw missing("Location not found");
        return plans.findByLocationId(locationId).map(this::view)
                .orElseGet(() -> new View(locationId, -1, Geometry.empty()));
    }

    @Transactional
    @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
    public SaveResult save(UUID locationId, SaveRequest request) {
        // Lock the parent even on first save: two editors cannot both create version -1.
        if (entityManager.find(Location.class, locationId, LockModeType.PESSIMISTIC_WRITE) == null)
            throw missing("Location not found");
        LocationFloorPlan plan = plans.findByLocationId(locationId).orElse(null);
        long actualVersion = plan == null ? -1 : plan.getVersion();
        if (request.version() == null || request.version() != actualVersion)
            throw conflict("Floor plan was changed; reload the map before saving again");

        Set<UUID> areaIds = new HashSet<>();
        Map<UUID, Long> requestedAreas = new HashMap<>();
        for (AreaVersion area : request.areaVersions()) {
            if (requestedAreas.put(area.id(), area.version()) != null) throw invalid("Duplicate area version");
        }
        for (Area area : areas.findByLocationIdOrderByDisplayOrderAscNameAsc(locationId).stream()
                .sorted(Comparator.comparing(Area::getId)).toList()) {
            // A changed Area size would invalidate the editor's coordinate transform.
            entityManager.refresh(area, LockModeType.PESSIMISTIC_READ);
            if (!Objects.equals(area.getVersion(), requestedAreas.get(area.getId())))
                throw conflict("Area was changed; reload the map before saving again");
            areaIds.add(area.getId());
        }
        if (!areaIds.equals(requestedAreas.keySet())) throw conflict("Location areas were changed; reload the map before saving again");
        validateGeometry(request.geometry(), areaIds);

        // Position-only saves also advance the floor plan's revision.
        if (plan != null) entityManager.lock(plan, LockModeType.PESSIMISTIC_FORCE_INCREMENT);

        Set<UUID> positionIds = new HashSet<>();
        List<PhysicalResource> changedResources = new ArrayList<>();
        // Stable lock order also protects concurrent resource configuration and map saves.
        for (ResourcePosition position : request.resourcePositions().stream()
                .sorted(Comparator.comparing(ResourcePosition::id)).toList()) {
            if (!positionIds.add(position.id())) throw invalid("Duplicate resource position");
            PhysicalResource resource = resources.findLocked(position.id()).orElseThrow(() -> missing("Resource not found"));
            if (!areaIds.contains(resource.getAreaId())) throw invalid("Resource does not belong to this location");
            if (!Objects.equals(resource.getVersion(), position.version()))
                throw conflict("Resource was changed; reload the map before saving again");
            resource.setX(position.x()); resource.setY(position.y());
            resource.setWidth(position.width()); resource.setHeight(position.height());
            resource.setRotation(position.rotation());
            changedResources.add(resource);
        }
        if (plan == null) { plan = new LocationFloorPlan(); plan.setLocationId(locationId); }
        plan.setGeometryJson(mapper.writeValueAsString(request.geometry()));
        // Geometry and existing resource positions are committed in one transaction.
        View saved = view(plans.saveAndFlush(plan));
        return new SaveResult(saved.locationId(), saved.version(), saved.geometry(), changedResources.stream()
                .map(resource -> new ResourcePosition(resource.getId(), resource.getVersion(), resource.getX(), resource.getY(),
                        resource.getWidth(), resource.getHeight(), resource.getRotation())).toList());
    }

    private void validateGeometry(Geometry geometry, Set<UUID> areaIds) {
        Set<String> ids = new HashSet<>();
        Set<UUID> linkedAreas = new HashSet<>();
        for (Room room : geometry.rooms()) {
            unique(ids, room.id()); point(room.x(), room.y()); size(room.width()); size(room.height());
            point(room.x() + room.width(), room.y() + room.height());
            if (room.areaId() != null && (!areaIds.contains(room.areaId()) || !linkedAreas.add(room.areaId())))
                throw invalid("Each room must reference a distinct area of this location");
        }
        for (Wall wall : geometry.walls()) {
            unique(ids, wall.id()); segment(wall.x1(), wall.y1(), wall.x2(), wall.y2()); size(wall.thickness());
        }
        for (Door door : geometry.doors()) {
            unique(ids, door.id()); segment(door.x1(), door.y1(), door.x2(), door.y2());
        }
    }

    private void unique(Set<String> ids, String id) {
        if (!ids.add(id)) throw invalid("Duplicate geometry element");
    }
    private void segment(double x1, double y1, double x2, double y2) {
        point(x1, y1); point(x2, y2);
        if (Math.hypot(x2 - x1, y2 - y1) < 1) throw invalid("Wall or passage must have a positive length");
    }
    private void point(double x, double y) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || x < 0 || y < 0 || x > 10_000_000 || y > 10_000_000)
            throw invalid("Coordinates must be finite values between 0 and 10000000");
    }
    private void size(double value) {
        if (!Double.isFinite(value) || value < 1 || value > 10_000_000) throw invalid("Dimensions must be between 1 and 10000000");
    }
    private View view(LocationFloorPlan plan) {
        return new View(plan.getLocationId(), plan.getVersion(), mapper.readValue(plan.getGeometryJson(), Geometry.class));
    }
    private ApplicationException invalid(String message) { return new ApplicationException(HttpStatus.BAD_REQUEST, message); }
    private ApplicationException missing(String message) { return new ApplicationException(HttpStatus.NOT_FOUND, message); }
    private ApplicationException conflict(String message) { return new ApplicationException(HttpStatus.CONFLICT, message); }
}
