package com.game_manager.gm.gamingsession.billing;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
/** Compatibility port used by Machine Protocol; all new accounting uses persistent seconds. */
@Service @RequiredArgsConstructor
public class MeteredSessionRuntime {
    private final GamingTimeService time;
    public void finish(UUID id) { time.tick(id,false,true); }
    public void tick(UUID id,boolean renew) { time.tick(id,renew,false); }
}
