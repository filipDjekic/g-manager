package com.game_manager.gm.resource;
import com.game_manager.gm.resource.dto.*;
import com.game_manager.gm.resource.dto.ResourceResponses.*;
import jakarta.validation.Valid;
import java.util.*;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/resources") @RequiredArgsConstructor
public class ResourceController {
 private final ResourceManagementService service;
 @GetMapping("/locations") public List<LocationView> locations(){return service.locations();}
 @PostMapping("/locations") @ResponseStatus(HttpStatus.CREATED) public LocationView createLocation(@Valid @RequestBody LocationRequest r){return service.createLocation(r);}
 @PutMapping("/locations/{id}") public LocationView updateLocation(@PathVariable UUID id,@Valid @RequestBody LocationRequest r){return service.updateLocation(id,r);}
 @GetMapping("/locations/{id}/areas") public List<AreaView> areas(@PathVariable UUID id){return service.areas(id);}
 @PostMapping("/locations/{id}/areas") @ResponseStatus(HttpStatus.CREATED) public AreaView createArea(@PathVariable UUID id,@Valid @RequestBody AreaRequest r){return service.createArea(id,r);}
 @PutMapping("/areas/{id}") public AreaView updateArea(@PathVariable UUID id,@Valid @RequestBody AreaRequest r){return service.updateArea(id,r);}
 @GetMapping("/areas/{id}") public List<ResourceView> resources(@PathVariable UUID id){return service.resources(id);}
 @GetMapping("/areas/{id}/availability") public List<ResourceAvailabilityView> availability(@PathVariable UUID id,@RequestParam(required=false) UUID serviceId,@RequestParam Instant start,@RequestParam Instant end){return service.availability(id,serviceId,start,end);}
 @PostMapping("/areas/{id}") @ResponseStatus(HttpStatus.CREATED) public ResourceView createResource(@PathVariable UUID id,@Valid @RequestBody ResourceRequest r){return service.createResource(id,r);}
 @PutMapping("/{id}") public ResourceView updateResource(@PathVariable UUID id,@Valid @RequestBody ResourceRequest r){return service.updateResource(id,r);}
}
