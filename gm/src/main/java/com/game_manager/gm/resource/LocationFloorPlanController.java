package com.game_manager.gm.resource;

import com.game_manager.gm.resource.dto.FloorPlanDtos.*;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/resources/locations/{locationId}/floor-plan")
@RequiredArgsConstructor
public class LocationFloorPlanController {
    private final LocationFloorPlanService service;

    @GetMapping
    public View load(@PathVariable UUID locationId) { return service.load(locationId); }

    @PutMapping
    public SaveResult save(@PathVariable UUID locationId, @Valid @RequestBody SaveRequest request) {
        return service.save(locationId, request);
    }
}
