package com.game_manager.gm.waitlist.dto;
import java.time.Instant;
public record WaitlistStatistics(long active, long waiting, long offered, long accepted, long cancelled,
        long expiredOffers, Instant periodStart, Instant periodEnd, Instant serverTime) {}
