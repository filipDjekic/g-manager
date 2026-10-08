package com.game_manager.gm.waitlist.dto;

import com.game_manager.gm.waitlist.*;
import java.time.Instant;
import java.util.UUID;

public record WaitlistOperationalResponse(UUID id,UUID customerId,String customerName,
        UUID employeeId,String employeeName,UUID serviceId,String serviceName,
        UUID locationId,String locationName,UUID resourceId,String resourceName,
        Instant createdAt,Instant desiredStart,Instant desiredEnd,WaitlistStatus status,
        UUID offerId,Instant offerExpiresAt,WaitlistOfferStatus offerStatus,String resourceCode,
        Long version,Instant serverTime,boolean stationManageable,boolean readOnly) {
    public WaitlistOperationalResponse(UUID id,UUID customerId,String customerName,
            UUID employeeId,String employeeName,UUID serviceId,String serviceName,
            UUID locationId,String locationName,UUID resourceId,String resourceName,
            Instant createdAt,Instant desiredStart,Instant desiredEnd,WaitlistStatus status,
            UUID offerId,Instant offerExpiresAt,WaitlistOfferStatus offerStatus,String resourceCode,Long version) {
        this(id,customerId,customerName,employeeId,employeeName,serviceId,serviceName,locationId,locationName,
                resourceId,resourceName,createdAt,desiredStart,desiredEnd,status,offerId,offerExpiresAt,
                offerStatus,resourceCode,version,null,false,true);
    }
    public WaitlistOperationalResponse withAccess(Instant now,boolean stationManageable) {
        return new WaitlistOperationalResponse(id,customerId,customerName,employeeId,employeeName,serviceId,serviceName,
                locationId,locationName,resourceId,resourceName,createdAt,desiredStart,desiredEnd,status,offerId,offerExpiresAt,
                offerStatus==WaitlistOfferStatus.OFFERED&&!offerExpiresAt.isAfter(now)?WaitlistOfferStatus.EXPIRED:offerStatus,
                resourceCode,version,now,stationManageable,true);
    }
}
