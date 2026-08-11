package com.game_manager.gm.timeoff;
import java.time.Instant; import java.util.UUID;
public record TimeOffInterval(UUID employeeId,Instant start,Instant end){public boolean overlaps(Instant otherStart,Instant otherEnd){return start.isBefore(otherEnd)&&end.isAfter(otherStart);}}
