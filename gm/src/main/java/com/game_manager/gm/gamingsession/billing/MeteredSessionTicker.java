package com.game_manager.gm.gamingsession.billing;
import com.game_manager.gm.gamingsession.*;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
@Component @RequiredArgsConstructor
public class MeteredSessionTicker {
    @org.springframework.beans.factory.annotation.Autowired private GamingTimeService time;
    @org.springframework.beans.factory.annotation.Autowired private java.time.Clock clock;
    private final GamingSessionRepository sessions;
    private final MeteredSessionRuntime runtime;
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(MeteredSessionTicker.class);
    @Scheduled(fixedDelayString="${app.gaming-session.metered-billing-millis:10000}")
    public void bill() {
        time.expireWaiting(clock.instant());
        for(var s:sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE)) {
            if(s.getBillingMode()!=GamingBillingMode.TIME_BALANCE) continue;
            try { runtime.tick(s.getId(),false); } catch(RuntimeException e) { LOG.error("Metered settlement failed for {}",s.getId(),e); }
        }
    }
}
