package com.game_manager.gm.waitlist.dto;

import com.game_manager.gm.waitlist.*;
import java.time.Instant;
import java.util.UUID;

public record WaitlistResponse(UUID id, UUID serviceId, UUID employeeId, Instant desiredStart,
                               WaitlistStatus status, UUID offerId, Instant offerExpiresAt,
                               UUID reservationId, Long version) {
    public static WaitlistResponse from(WaitlistEntry entry, WaitlistOffer offer) {
        return new WaitlistResponse(entry.getId(), entry.getServiceId(), entry.getEmployeeId(),
                entry.getDesiredStart(), entry.getStatus(), offer == null ? null : offer.getId(),
                offer == null ? null : offer.getExpiresAt(),
                offer == null ? null : offer.getReservationId(), entry.getVersion());
    }
}
