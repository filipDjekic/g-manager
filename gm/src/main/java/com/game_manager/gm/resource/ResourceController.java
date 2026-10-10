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
 private final LocationAccessService access;
 private final ResourceAccessService resourceAccess;
 private final com.game_manager.gm.common.security.CurrentUserProvider currentUser;
 @GetMapping("/reservation-filters") public List<BookingResourceView> reservationResources(){return service.reservationResources();}
 @GetMapping("/management-scope") public ResourceAccessService.ManagementScope managementScope(){return resourceAccess.scope();}
 @GetMapping("/{id}/employees") public List<ResourceAccessService.Assignment> resourceEmployees(@PathVariable UUID id){return resourceAccess.list(id);}
 @PutMapping("/{id}/employees/{employeeId}") public ResourceAccessService.Assignment resourceEmployees(@PathVariable UUID id,@PathVariable UUID employeeId,@Valid @RequestBody ResourceAccessService.AssignmentRequest r){return resourceAccess.set(id,employeeId,r);}
 @GetMapping("/booking-options") public BookingOptionsResponse bookingOptions(@RequestParam UUID serviceId,
  @RequestParam(required=false) UUID locationId,@RequestParam(required=false) Instant start,@RequestParam(required=false) Instant end,@RequestParam(defaultValue="false") boolean managedOnly,
  @RequestParam(required=false) UUID areaId){
  if(!managedOnly)return service.bookingOptions(serviceId,locationId,start,end,null,null,areaId);
  var actor=currentUser.requireCurrentUser();
  if(actor.role()==com.game_manager.gm.common.security.Role.CUSTOMER)throw new com.game_manager.gm.common.error.ApplicationException(HttpStatus.FORBIDDEN,"Staff access is required");
  return service.bookingOptions(serviceId,locationId,start,end,resourceAccess.allResources(actor)?null:resourceAccess.assignedResources(actor),null,areaId);
 }
 @GetMapping("/locations/{id}/employees") public List<LocationAccessService.Assignment> employeeAccess(@PathVariable UUID id){return access.list(id);}
 @PutMapping("/locations/{id}/employees/{employeeId}") public LocationAccessService.Assignment employeeAccess(@PathVariable UUID id,@PathVariable UUID employeeId,@Valid @RequestBody LocationAccessService.AssignmentRequest r){return access.set(id,employeeId,r);}
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
