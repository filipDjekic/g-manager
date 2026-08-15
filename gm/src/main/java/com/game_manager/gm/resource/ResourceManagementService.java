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
 public ResourceView createResource(UUID areaId,ResourceRequest r){area(areaId);requireService(r.serviceId());PhysicalResource v=new PhysicalResource();v.setAreaId(areaId);apply(v,r);return ResourceView.from(resources.saveAndFlush(v));}
 @Transactional @PreAuthorize("hasAuthority('RESOURCE_MANAGE')")
 public ResourceView updateResource(UUID id,ResourceRequest r){PhysicalResource v=resource(id);version(v.getVersion(),r.version());requireService(r.serviceId());apply(v,r);return ResourceView.from(resources.saveAndFlush(v));}
 @Transactional(readOnly=true) public PhysicalResource requireBookable(UUID id,UUID serviceId){PhysicalResource v=resource(id);requireBookableState(v,serviceId);return v;}
 @Transactional public PhysicalResource lockBookable(UUID id,UUID serviceId){PhysicalResource v=resources.findLocked(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Resource not found"));requireBookableState(v,serviceId);return v;}
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
 private void requireBookableState(PhysicalResource v,UUID serviceId){boolean unavailableStation=v.getType()==ResourceType.GAMING_PC&&stationProfiles.findByResourceId(v.getId()).map(profile->profile.getOperationalStatus()!=com.game_manager.gm.station.StationOperationalStatus.AVAILABLE).orElse(false);if(!v.isActive()||!v.isBookable()||!v.getServiceId().equals(serviceId)||unavailableStation)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected resource is not bookable for this service");}
 private ResourceAvailabilityView.Availability availabilityStatus(PhysicalResource v,Instant start,Instant end){if(!v.isActive()||!v.isBookable())return ResourceAvailabilityView.Availability.INACTIVE;if(v.getType()==ResourceType.GAMING_PC){var state=stationProfiles.findByResourceId(v.getId()).map(com.game_manager.gm.station.GamingStationProfile::getOperationalStatus).orElse(com.game_manager.gm.station.StationOperationalStatus.AVAILABLE);if(state==com.game_manager.gm.station.StationOperationalStatus.MAINTENANCE)return ResourceAvailabilityView.Availability.MAINTENANCE;if(state==com.game_manager.gm.station.StationOperationalStatus.RETIRED)return ResourceAvailabilityView.Availability.RETIRED;}return availability.isResourceAvailable(v.getId(),start,end,null)?ResourceAvailabilityView.Availability.AVAILABLE:ResourceAvailabilityView.Availability.OCCUPIED;}
 private static String trim(String v){return v==null||v.isBlank()?null:v.trim();}
}
