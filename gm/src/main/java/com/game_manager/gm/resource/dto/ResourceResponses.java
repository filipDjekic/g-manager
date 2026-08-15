package com.game_manager.gm.resource.dto;
import com.game_manager.gm.resource.*;
import java.util.UUID;
public final class ResourceResponses {
 private ResourceResponses(){}
 public record LocationView(UUID id,String code,String name,String address,String description,String timezone,boolean active,Long version){public static LocationView from(Location v){return new LocationView(v.getId(),v.getCode(),v.getName(),v.getAddress(),v.getDescription(),v.getTimezone(),v.isActive(),v.getVersion());}}
 public record AreaView(UUID id,UUID locationId,String code,String name,String description,boolean active,int displayOrder,int mapWidth,int mapHeight,Long version){public static AreaView from(Area v){return new AreaView(v.getId(),v.getLocationId(),v.getCode(),v.getName(),v.getDescription(),v.isActive(),v.getDisplayOrder(),v.getMapWidth(),v.getMapHeight(),v.getVersion());}}
 public record ResourceView(UUID id,UUID areaId,UUID serviceId,String code,String name,ResourceType type,String description,boolean active,boolean bookable,int capacity,int displayOrder,int x,int y,int width,int height,int rotation,Long version){public static ResourceView from(PhysicalResource v){return new ResourceView(v.getId(),v.getAreaId(),v.getServiceId(),v.getCode(),v.getName(),v.getType(),v.getDescription(),v.isActive(),v.isBookable(),v.getCapacity(),v.getDisplayOrder(),v.getX(),v.getY(),v.getWidth(),v.getHeight(),v.getRotation(),v.getVersion());}}
}
