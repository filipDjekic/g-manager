package com.game_manager.gm.waitlist.dto;
import com.game_manager.gm.waitlist.WaitlistHistory;
import java.util.List;
public record WaitlistDetailResponse(WaitlistOperationalResponse entry, List<WaitlistHistory.Event> history) {}
