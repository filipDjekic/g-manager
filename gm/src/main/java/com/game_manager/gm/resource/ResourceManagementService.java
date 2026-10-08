package com.game_manager.gm.resource;

import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.resource.dto.*;
import com.game_manager.gm.resource.dto.ResourceResponses.*;
import java.time.ZoneId;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class ResourceManagementService {
 private final LocationRepository locations; private final AreaRepository areas;
 private final PhysicalResourceRepository resources; private final CatalogService catalog;
 private final com.game_manager.gm.reservation.ReservationAvailabilityPolicy availability;
 private final com.game_manager.gm.station.GamingStationProfileRepository stationProfiles;
 private final com.game_manager.gm.workinghours.WorkingHoursService workingHours;
 private final jakarta.persistence.EntityManager entityManager;

 /** Include restricted resources so occupancy cannot be inferred from missing free slots. */
 @Transactional(readOnly=true,noRollbackFor=ApplicationException.class) public List<PhysicalResource> bookingCandidates(UUID serviceId,UUID requestedId,UUID locationId){
  List<PhysicalResource> values=requestedId==null?resources.findByServiceIdOrderByIdAsc(serviceId):List.of(resource(requestedId));
  Map<UUID,BookingResourceView> refs=resourceReferences(values.stream().map(PhysicalResource::getId).collect(java.util.stream.Collectors.toSet()));
  if(requestedId!=null){
   PhysicalResource selected=values.getFirst();
   if(!selected.getServiceId().equals(serviceId))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Resource does not support the selected service");
   if(locationId!=null&&!locationId.equals(refs.get(requestedId).locationId()))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Resource does not belong to the selected location");
  }
  return values.stream().filter(v->locationId==null||locationId.equals(refs.get(v.getId()).locationId())).toList();
 }
 @Transactional(readOnly=true) public Map<UUID,String> bookingRestrictions(List<PhysicalResource> values){
  if(values.isEmpty())return Map.of();
  Set<UUID> areaIds=values.stream().map(PhysicalResource::getAreaId).collect(java.util.stream.Collectors.toSet());
  Map<UUID,Area> areaMap=areas.findAllById(areaIds).stream().collect(java.util.stream.Collectors.toMap(Area::getId,java.util.function.Function.identity()));
  Set<UUID> locationIds=areaMap.values().stream().map(Area::getLocationId).collect(java.util.stream.Collectors.toSet());
  Map<UUID,Location> locationMap=locations.findAllById(locationIds).stream().collect(java.util.stream.Collectors.toMap(Location::getId,java.util.function.Function.identity()));
  Map<UUID,com.game_manager.gm.station.StationOperationalStatus> states=stationProfiles.findByResourceIdIn(values.stream().map(PhysicalResource::getId).toList()).stream()
   .collect(java.util.stream.Collectors.toMap(com.game_manager.gm.station.GamingStationProfile::getResourceId,com.game_manager.gm.station.GamingStationProfile::getOperationalStatus));
  Map<UUID,String> result=new HashMap<>();
  for(PhysicalResource v:values){
   Area area=areaMap.get(v.getAreaId());Location location=area==null?null:locationMap.get(area.getLocationId());
   if(!v.isActive()||!v.isBookable()||area==null||!area.isActive()||location==null||!location.isActive())result.put(v.getId(),"Resource or location is inactive or not bookable");
   else if(v.getType()==ResourceType.GAMING_PC&&states.getOrDefault(v.getId(),com.game_manager.gm.station.StationOperationalStatus.AVAILABLE)!=com.game_manager.gm.station.StationOperationalStatus.AVAILABLE)
    result.put(v.getId(),"Station is unavailable for booking");
  }
  return result;
 }
 @Transactional(readOnly=true) public boolean requiresResource(UUID serviceId){
  return resourceRequirements(Set.of(serviceId)).get(serviceId);
 }
 @Transactional(readOnly=true) public Map<UUID,Boolean> resourceRequirements(Set<UUID> serviceIds){
  if(serviceIds.isEmpty())return Map.of();
  Map<UUID,CatalogReference> services=catalog.getReferences(serviceIds);
  Set<UUID> linked=resources.resourceServiceIds(serviceIds);
  Map<UUID,Boolean> result=new HashMap<>();
  for(UUID id:serviceIds){
   CatalogReference service=services.get(id);
   if(service==null)throw new ApplicationException(HttpStatus.NOT_FOUND,"Catalog item not found");
   result.put(id,service.requiresResource()||linked.contains(id));
  }
  return result;
 }
 @Transactional(readOnly=true) public Map<UUID,BookingResourceView> resourceReferences(Set<UUID> ids){
  if(ids.isEmpty())return Map.of();
  return resources.references(ids).stream().collect(java.util.stream.Collectors.toMap(BookingResourceView::id,java.util.function.Function.identity()));
 }
 @Transactional(readOnly=true) public Map<UUID,String> locationNames(Set<UUID> ids){
  if(ids.isEmpty())return Map.of();
  return locations.findAllById(ids).stream().collect(java.util.stream.Collectors.toMap(Location::getId,Location::getName));
 }
 @Transactional(readOnly=true) public List<PhysicalResource> bookableResources(UUID serviceId,UUID locationId){
  return resources.findByServiceIdAndActiveTrueAndBookableTrueOrderByDisplayOrderAscNameAsc(serviceId).stream()
   .filter(v->isBookableState(v,serviceId))
   .filter(v->locationId==null||locationId.equals(locationId(v)))
   .sorted(Comparator.comparing(PhysicalResource::getId)).toList();
 }
 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESOURCE_READ')")
 public BookingOptionsResponse bookingOptions(UUID serviceId,UUID locationId,Instant start,Instant end){
  return bookingOptions(serviceId,locationId,start,end,null,null);
 }
 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESOURCE_READ')") public BookingOptionsResponse bookingOptions(UUID serviceId,UUID locationId,Instant start,Instant end,Set<UUID> allowedIds,UUID excludeId){
  requireService(serviceId);
  if((start==null)!=(end==null)||(start!=null&&!end.isAfter(start)))
   throw new ApplicationException(HttpStatus.BAD_REQUEST,"Resource interval is invalid");
  List<PhysicalResource> candidates=bookableResources(serviceId,locationId).stream().filter(v->allowedIds==null||allowedIds.contains(v.getId())).toList();
  Map<UUID,BookingResourceView> references=resourceReferences(candidates.stream().map(PhysicalResource::getId).collect(java.util.stream.Collectors.toSet()));
  return new BookingOptionsResponse(requiresResource(serviceId),candidates.stream().map(v->{
   BookingResourceView ref=references.get(v.getId());
   return new BookingResourceView(ref.id(),ref.serviceId(),ref.code(),ref.name(),ref.type(),ref.locationId(),ref.locationName(),
    start==null||isAvailableForBooking(v,start,end,excludeId));
  }).toList());
 }
 @Transactional(readOnly=true) public boolean isAvailableForBooking(PhysicalResource v,Instant start,Instant end){return isAvailableForBooking(v,start,end,null);}
 private boolean isAvailableForBooking(PhysicalResource v,Instant start,Instant end,UUID excludeId){
  if(!isBookableState(v,v.getServiceId())||!availability.isResourceAvailable(v.getId(),start,end,excludeId))return false;
  try{workingHours.validateWithinWorkingHours(locationId(v),start,end);return true;}
  catch(ApplicationException exception){if(exception.getStatus()!=HttpStatus.CONFLICT)throw exception;return false;}
 }
 @Transactional(noRollbackFor=ApplicationException.class) public PhysicalResource selectForBooking(UUID serviceId,UUID requestedId,UUID locationId,Instant start,Instant end){
  return selectForBooking(serviceId,requestedId,locationId,start,end,null);
 }
 @Transactional(noRollbackFor=ApplicationException.class) public PhysicalResource selectForBooking(UUID serviceId,UUID requestedId,UUID locationId,Instant start,Instant end,Set<UUID> allowedIds){
  if(requestedId!=null&&allowedIds!=null&&!allowedIds.contains(requestedId))throw new ApplicationException(HttpStatus.FORBIDDEN,"Station management is not permitted");
  if(requestedId!=null){
   PhysicalResource v=lockBookable(requestedId,serviceId);
   if(locationId!=null&&!locationId.equals(locationId(v)))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Resource does not belong to the selected location");
   workingHours.validateWithinWorkingHours(locationId(v),start,end);
   availability.requireResourceAvailableForUpdate(v.getId(),start,end,null);
   return v;
  }
  if(!requiresResource(serviceId))return null;
  for(PhysicalResource candidate:bookableResources(serviceId,locationId).stream().filter(v->allowedIds==null||allowedIds.contains(v.getId())).toList()){
   PhysicalResource v=resources.findLocked(candidate.getId()).orElse(null);
   if(v!=null)entityManager.refresh(v,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
   if(v==null||!isBookableState(v,serviceId)||(locationId!=null&&!locationId.equals(locationId(v))))continue;
   try{workingHours.validateWithinWorkingHours(locationId(v),start,end);}
   catch(ApplicationException exception){if(exception.getStatus()!=HttpStatus.CONFLICT)throw exception;continue;}
   if(availability.isResourceAvailableForUpdate(v.getId(),start,end,null))return v;
  }
  throw new ApplicationException(HttpStatus.CONFLICT,"No compatible resource is available at this time");
 }

 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESERVATION_READ_ALL')")
 public List<BookingResourceView> reservationResources(){
  var refs=resourceReferences(resources.findAll().stream().map(PhysicalResource::getId).collect(java.util.stream.Collectors.toSet()));
  return refs.values().stream().sorted(Comparator.comparing(BookingResourceView::locationName).thenComparing(BookingResourceView::code)).toList();
 }
 @Transactional(readOnly=true) public Map<UUID,String> resourceNames(Set<UUID> ids){
  if(ids.isEmpty())return Map.of();
  return resources.findAllById(ids).stream().collect(java.util.stream.Collectors.toMap(PhysicalResource::getId,PhysicalResource::getName));
 }

 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESOURCE_READ')")
 public List<LocationView> locations(){return locations.findAllByOrderByNameAsc().stream().map(LocationView::from).toList();}
 @Transactional @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
 public LocationView createLocation(LocationRequest r){validateZone(r.timezone());Location v=new Location();apply(v,r);return LocationView.from(locations.saveAndFlush(v));}
 @Transactional @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
 public LocationView updateLocation(UUID id,LocationRequest r){Location v=location(id);version(v.getVersion(),r.version());validateZone(r.timezone());apply(v,r);return LocationView.from(locations.saveAndFlush(v));}
 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESOURCE_READ')")
 public List<AreaView> areas(UUID locationId){location(locationId);return areas.findByLocationIdOrderByDisplayOrderAscNameAsc(locationId).stream().map(AreaView::from).toList();}
 @Transactional @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
 public AreaView createArea(UUID locationId,AreaRequest r){location(locationId);Area v=new Area();v.setLocationId(locationId);apply(v,r);return AreaView.from(areas.saveAndFlush(v));}
 @Transactional @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
 public AreaView updateArea(UUID id,AreaRequest r){Area v=area(id);version(v.getVersion(),r.version());apply(v,r);return AreaView.from(areas.saveAndFlush(v));}
 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESOURCE_READ')")
 public List<ResourceView> resources(UUID areaId){area(areaId);return resources.findByAreaIdOrderByDisplayOrderAscNameAsc(areaId).stream().map(ResourceView::from).toList();}
 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('RESOURCE_READ')")
 public List<ResourceAvailabilityView> availability(UUID areaId,UUID serviceId,Instant start,Instant end){
  if(start==null||end==null||!end.isAfter(start))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Resource interval is invalid");
  return resources.findByAreaIdOrderByDisplayOrderAscNameAsc(areaId).stream().filter(v->serviceId==null||v.getServiceId().equals(serviceId)).map(v->new ResourceAvailabilityView(v.getId(),v.getAreaId(),v.getServiceId(),v.getCode(),v.getName(),v.getType(),v.getX(),v.getY(),v.getWidth(),v.getHeight(),v.getRotation(),availabilityStatus(v,start,end),start,end)).toList();
 }
 @Transactional @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
 public ResourceView createResource(UUID areaId,ResourceRequest r){area(areaId);catalog.requirePhysicalResource(r.serviceId());PhysicalResource v=new PhysicalResource();v.setAreaId(areaId);apply(v,r);return ResourceView.from(resources.saveAndFlush(v));}
 @Transactional @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
 public ResourceView updateResource(UUID id,ResourceRequest r){PhysicalResource v=resource(id);version(v.getVersion(),r.version());catalog.requirePhysicalResource(r.serviceId());apply(v,r);return ResourceView.from(resources.saveAndFlush(v));}
 @Transactional(readOnly=true,noRollbackFor=ApplicationException.class) public PhysicalResource requireBookable(UUID id,UUID serviceId){PhysicalResource v=resource(id);requireBookableState(v,serviceId);return v;}
 @Transactional public PhysicalResource lockBookable(UUID id,UUID serviceId){PhysicalResource v=resources.findLocked(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Resource not found"));entityManager.refresh(v,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);requireBookableState(v,serviceId);return v;}
 @Transactional public PhysicalResource lockResource(UUID id){PhysicalResource v=resources.findLocked(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Resource not found"));entityManager.refresh(v,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);return v;}
 @Transactional(readOnly=true,noRollbackFor=ApplicationException.class) public void requireActiveLocation(UUID id){if(!location(id).isActive())throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Location is inactive");}
 @Transactional public PhysicalResource lockGamingStation(UUID id){PhysicalResource v=resources.findLocked(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Gaming station not found"));if(v.getType()!=ResourceType.GAMING_PC)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected resource is not a gaming PC");requireBookableState(v,v.getServiceId());return v;}
 public UUID locationId(PhysicalResource r){return area(r.getAreaId()).getLocationId();}
 private Location location(UUID id){return locations.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Location not found"));}
 private Area area(UUID id){return areas.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Area not found"));}
 private PhysicalResource resource(UUID id){return resources.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Resource not found"));}
 private void requireService(UUID id){CatalogItem item=catalog.getActiveById(id);if(item.getType()!=ItemType.SERVICE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Resource must reference a service");}
 private static void version(Long actual,Long expected){if(expected==null||!actual.equals(expected))throw new ApplicationException(HttpStatus.CONFLICT,"Resource was changed; refresh and try again");}
 private static void validateZone(String value){try{ZoneId.of(value);}catch(Exception e){throw new ApplicationException(HttpStatus.BAD_REQUEST,"Location timezone is invalid");}}
 private static void apply(Location v,LocationRequest r){v.setCode(r.code().trim());v.setName(r.name().trim());v.setAddress(r.address().trim());v.setDescription(trim(r.description()));v.setTimezone(r.timezone());v.setActive(r.active());}
 private static void apply(Area v,AreaRequest r){v.setCode(r.code().trim());v.setName(r.name().trim());v.setDescription(trim(r.description()));v.setActive(r.active());v.setDisplayOrder(r.displayOrder());v.setMapWidth(r.mapWidth());v.setMapHeight(r.mapHeight());}
 private static void apply(PhysicalResource v,ResourceRequest r){v.setServiceId(r.serviceId());v.setCode(r.code().trim());v.setName(r.name().trim());v.setType(r.type());v.setDescription(trim(r.description()));v.setActive(r.active());v.setBookable(r.bookable());v.setCapacity(r.capacity());v.setDisplayOrder(r.displayOrder());v.setX(r.x());v.setY(r.y());v.setWidth(r.width());v.setHeight(r.height());v.setRotation(r.rotation());}
 private boolean isBookableState(PhysicalResource v,UUID serviceId){
  boolean unavailableStation=v.getType()==ResourceType.GAMING_PC&&stationProfiles.findByResourceId(v.getId()).map(profile->profile.getOperationalStatus()!=com.game_manager.gm.station.StationOperationalStatus.AVAILABLE).orElse(false);
  Area a=area(v.getAreaId());
  return v.isActive()&&v.isBookable()&&v.getServiceId().equals(serviceId)&&!unavailableStation&&a.isActive()&&location(a.getLocationId()).isActive();
 }
 private void requireBookableState(PhysicalResource v,UUID serviceId){if(!isBookableState(v,serviceId))throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected resource is not bookable for this service");}
 private ResourceAvailabilityView.Availability availabilityStatus(PhysicalResource v,Instant start,Instant end){if(!v.isActive()||!v.isBookable())return ResourceAvailabilityView.Availability.INACTIVE;if(v.getType()==ResourceType.GAMING_PC){var state=stationProfiles.findByResourceId(v.getId()).map(com.game_manager.gm.station.GamingStationProfile::getOperationalStatus).orElse(com.game_manager.gm.station.StationOperationalStatus.AVAILABLE);if(state==com.game_manager.gm.station.StationOperationalStatus.MAINTENANCE)return ResourceAvailabilityView.Availability.MAINTENANCE;if(state==com.game_manager.gm.station.StationOperationalStatus.RETIRED)return ResourceAvailabilityView.Availability.RETIRED;}return availability.isResourceAvailable(v.getId(),start,end,null)?ResourceAvailabilityView.Availability.AVAILABLE:ResourceAvailabilityView.Availability.OCCUPIED;}
 private static String trim(String v){return v==null||v.isBlank()?null:v.trim();}
}
