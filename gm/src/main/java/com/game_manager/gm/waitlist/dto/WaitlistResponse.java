package com.game_manager.gm.waitlist.dto;

import com.game_manager.gm.waitlist.*;
import java.time.Instant;
import java.util.UUID;

public record WaitlistResponse(UUID id,UUID serviceId,UUID employeeId,UUID locationId,
        UUID resourceId,Instant desiredStart,Instant desiredEnd,WaitlistStatus status,UUID offerId,
        Instant offerExpiresAt,UUID reservationId,Long version,String serviceName,String employeeName,
        String locationName,String resourceCode,String resourceName,WaitlistOfferStatus offerStatus,
        Instant createdAt,Instant serverTime) {
    public static WaitlistResponse from(WaitlistEntry entry,WaitlistOffer offer) {
        return new WaitlistResponse(entry.getId(),entry.getServiceId(),entry.getEmployeeId(),entry.getLocationId(),
                offer!=null&&offer.getResourceId()!=null?offer.getResourceId():entry.getResourceId(),entry.getDesiredStart(),entry.getDesiredEnd(),entry.getStatus(),
                offer==null?null:offer.getId(),offer==null?null:offer.getExpiresAt(),offer==null?null:offer.getReservationId(),
                entry.getVersion(),null,null,null,null,null,offer==null?null:offer.getStatus(),entry.getCreatedAt(),null);
    }
    public WaitlistResponse enriched(String serviceName,String employeeName,UUID resolvedLocationId,String locationName,String resourceCode,String resourceName,Instant now) {
        return new WaitlistResponse(id,serviceId,employeeId,resolvedLocationId,resourceId,desiredStart,desiredEnd,status,offerId,
                offerExpiresAt,reservationId,version,serviceName,employeeName,locationName,resourceCode,resourceName,
                offerStatus==WaitlistOfferStatus.OFFERED&&!offerExpiresAt.isAfter(now)?WaitlistOfferStatus.EXPIRED:offerStatus,createdAt,now);
    }
}
