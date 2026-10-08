package com.game_manager.gm.reservation;

/** Public occupancy classification, without customer data. */
public enum BookingSlotStatus {
    AVAILABLE, OCCUPIED_RESERVATION, OCCUPIED_RESOURCE, OCCUPIED_SESSION, UNAVAILABLE;

    public boolean occupied() {
        return this == OCCUPIED_RESERVATION || this == OCCUPIED_RESOURCE || this == OCCUPIED_SESSION;
    }
}
