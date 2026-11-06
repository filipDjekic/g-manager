package com.game_manager.gm.gamingsession.billing;

import com.game_manager.gm.gamingsession.GamingSessionRepository;
import com.game_manager.gm.gamingsession.GamingSessionStatus;
import java.time.Clock;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor
public class GamingTimeTicker {
    private static final Logger LOG = LoggerFactory.getLogger(GamingTimeTicker.class);
    private final GamingTimeService time;
    private final GamingSessionRepository sessions;
    private final Clock clock;

    @Scheduled(fixedDelayString="${app.gaming-session.time-accounting-millis:10000}")
    public void settle() {
        time.expireWaiting(clock.instant());
        for (var session : sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE)) {
            try { time.tick(session.getId(), false, false); }
            catch (RuntimeException failure) { LOG.error("Time settlement failed for {}", session.getId(), failure); }
        }
    }
}
