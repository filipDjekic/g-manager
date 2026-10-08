package com.game_manager.gm.gamingsession.realtime;

import static org.mockito.Mockito.*;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.gamingsession.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class GamingSessionRealtimeHubTest {
    @Test void deliveryRechecksResourceAccessAndDoesNotBroadcastHiddenSessionIds() throws Exception {
        var access=mock(RealtimeAccess.class);
        var sessions=mock(GamingSessionRepository.class);
        var locations=mock(GamingSessionLocationPolicy.class);
        var assigned=new AuthenticatedUser(UUID.randomUUID(),"assigned@example.test",Role.EMPLOYEE);
        var hidden=new AuthenticatedUser(UUID.randomUUID(),"hidden@example.test",Role.EMPLOYEE);
        var session=new GamingSession();session.setId(UUID.randomUUID());session.setLocationId(UUID.randomUUID());session.setResourceId(UUID.randomUUID());
        when(sessions.findById(session.getId())).thenReturn(Optional.of(session));
        when(locations.canAccessResource(assigned,session.getResourceId())).thenReturn(true);
        when(locations.canAccessResource(hidden,session.getResourceId())).thenReturn(false);
        when(access.isValid(any(),eq(Permission.GAMING_SESSION_READ))).thenReturn(true);
        var hub=new GamingSessionRealtimeHub(new SimpleMeterRegistry(),access,sessions,locations);
        try(var construction=mockConstruction(SseEmitter.class)) {
            when(access.capture(Permission.GAMING_SESSION_READ)).thenReturn(new RealtimeAccess.Subscription(assigned,Instant.now().plusSeconds(60)));hub.connect();
            when(access.capture(Permission.GAMING_SESSION_READ)).thenReturn(new RealtimeAccess.Subscription(hidden,Instant.now().plusSeconds(60)));hub.connect();
            var event=new GamingSessionEvent(UUID.randomUUID(),"GAMING_SESSION_STARTED",session.getId(),Instant.now());
            hub.send(event);
            verify(construction.constructed().get(0)).send(any(SseEmitter.SseEventBuilder.class));
            verify(construction.constructed().get(1),never()).send(any(SseEmitter.SseEventBuilder.class));
            when(locations.canAccessResource(assigned,session.getResourceId())).thenReturn(false);
            hub.send(event);
            verify(construction.constructed().get(0),times(1)).send(any(SseEmitter.SseEventBuilder.class));
        }
    }
}
