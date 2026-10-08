package com.game_manager.gm.resource.dto;

import java.util.List;

public record BookingOptionsResponse(boolean resourceRequired, List<BookingResourceView> resources) {}
