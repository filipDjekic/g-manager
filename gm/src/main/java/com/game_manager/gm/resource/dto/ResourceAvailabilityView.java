package com.game_manager.gm.resource.dto;
import com.game_manager.gm.resource.ResourceType;
import java.time.Instant;
import java.util.UUID;
public record ResourceAvailabilityView(UUID id,UUID areaId,UUID serviceId,String code,String name,
 ResourceType type,int x,int y,int width,int height,int rotation,Availability status,Instant start,Instant end){
 public enum Availability { AVAILABLE, OCCUPIED, INACTIVE }
}
