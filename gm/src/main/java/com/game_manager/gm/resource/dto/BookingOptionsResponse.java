package com.game_manager.gm.resource.dto;

import java.util.List;

public record BookingOptionsResponse(boolean resourceRequired, List<BookingResourceView> resources,
        boolean variableDuration, int minimumDurationMinutes, int maximumDurationMinutes, int defaultDurationMinutes) {
    public BookingOptionsResponse(boolean resourceRequired,List<BookingResourceView> resources){this(resourceRequired,resources,false,0,0,0);}
}
