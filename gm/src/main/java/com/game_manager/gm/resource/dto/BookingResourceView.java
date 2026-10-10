package com.game_manager.gm.resource.dto;

import com.game_manager.gm.resource.ResourceType;
import java.util.UUID;

public record BookingResourceView(UUID id, UUID serviceId, String code, String name,
        ResourceType type, UUID locationId, String locationName, boolean available,
        UUID areaId, String areaName, String unavailabilityReason) {
    public BookingResourceView(UUID id,UUID serviceId,String code,String name,ResourceType type,UUID locationId,String locationName,boolean available) {
        this(id,serviceId,code,name,type,locationId,locationName,available,null,null,null);
    }
    public BookingResourceView(UUID id,UUID serviceId,String code,String name,ResourceType type,UUID locationId,String locationName,boolean available,UUID areaId,String areaName) {
        this(id,serviceId,code,name,type,locationId,locationName,available,areaId,areaName,null);
    }
}
