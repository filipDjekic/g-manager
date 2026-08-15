package com.game_manager.gm.station;

import com.game_manager.gm.station.dto.*;
import com.game_manager.gm.station.dto.StationResponses.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/stations")
@RequiredArgsConstructor
public class StationController {
    private final StationReadinessService service;

    @GetMapping public List<StationOverview> overview() { return service.overview(); }
    @PutMapping("/{resourceId}/profile") public StationOverview saveStation(@PathVariable UUID resourceId,
            @Valid @RequestBody StationProfileRequest request) { return service.saveStation(resourceId, request); }
    @GetMapping("/applications") public List<DefinitionView> definitions() { return service.definitions(); }
    @PostMapping("/applications") @ResponseStatus(HttpStatus.CREATED)
    public DefinitionView createDefinition(@Valid @RequestBody ApplicationDefinitionRequest request) { return service.createDefinition(request); }
    @PutMapping("/applications/{id}") public DefinitionView updateDefinition(@PathVariable UUID id,
            @Valid @RequestBody ApplicationDefinitionRequest request) { return service.updateDefinition(id, request); }
    @DeleteMapping("/applications/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDefinition(@PathVariable UUID id, @RequestParam long version) { service.deleteDefinition(id, version); }
    @GetMapping("/application-profiles") public List<ProfileView> profiles() { return service.profiles(); }
    @PostMapping("/application-profiles") @ResponseStatus(HttpStatus.CREATED)
    public ProfileView createProfile(@Valid @RequestBody ApplicationProfileRequest request) { return service.createProfile(request); }
    @PutMapping("/application-profiles/{id}") public ProfileView updateProfile(@PathVariable UUID id,
            @Valid @RequestBody ApplicationProfileRequest request) { return service.updateProfile(id, request); }
    @DeleteMapping("/application-profiles/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteProfile(@PathVariable UUID id, @RequestParam long version) { service.deleteProfile(id, version); }
}
