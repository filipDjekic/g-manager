package com.game_manager.gm.gamingsession;

import com.game_manager.gm.common.config.GamingSessionProperties;
import com.game_manager.gm.common.error.ApplicationException;
import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GamingSessionTransitionPolicy {
    private final GamingSessionProperties properties;

    public Duration startDuration(Integer minutes) {
        int value = minutes == null ? properties.defaultDurationMinutes() : minutes;
        if (value < properties.minimumDurationMinutes() || value > properties.maximumDurationMinutes())
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Session duration is outside the allowed range");
        return Duration.ofMinutes(value);
    }

    public Instant extendedEnd(GamingSession session, int minutes) {
        requireActive(session);
        if (minutes <= 0 || minutes > properties.maximumExtensionMinutes())
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Session extension is outside the allowed range");
        Instant candidate = session.getEndsAt().plus(Duration.ofMinutes(minutes));
        Instant maximum = session.getStartedAt().plus(Duration.ofMinutes(properties.maximumDurationMinutes()));
        if (candidate.isAfter(maximum))
            throw new ApplicationException(HttpStatus.CONFLICT, "Session maximum end time would be exceeded");
        return candidate;
    }

    public void requireActive(GamingSession session) {
        if (session.getStatus() != GamingSessionStatus.ACTIVE)
            throw new ApplicationException(HttpStatus.CONFLICT, "Gaming session is not active");
    }
}
