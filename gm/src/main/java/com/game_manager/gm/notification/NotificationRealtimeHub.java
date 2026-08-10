package com.game_manager.gm.notification;
import com.game_manager.gm.notification.dto.NotificationResponse; import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException; import java.util.*; import java.util.concurrent.ConcurrentHashMap; import org.springframework.scheduling.annotation.Scheduled; import org.springframework.stereotype.Component; import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
@Component public class NotificationRealtimeHub {
 private final Map<UUID,Set<SseEmitter>> clients=new ConcurrentHashMap<>(); private final MeterRegistry metrics;
 public NotificationRealtimeHub(MeterRegistry metrics){this.metrics=metrics;}
 public SseEmitter connect(UUID userId,long timeout){SseEmitter emitter=new SseEmitter(timeout);clients.computeIfAbsent(userId,k->ConcurrentHashMap.newKeySet()).add(emitter);metrics.counter("gm.notification.sse.connections").increment();
  emitter.onCompletion(()->remove(userId,emitter));emitter.onTimeout(()->remove(userId,emitter));emitter.onError(e->remove(userId,emitter));return emitter;}
 public void send(UUID userId,NotificationResponse value){for(SseEmitter emitter:List.copyOf(clients.getOrDefault(userId,Set.of())))try{emitter.send(SseEmitter.event().id(value.id().toString()).name("notification").data(value));}catch(IOException|IllegalStateException e){remove(userId,emitter);}}
 @Scheduled(fixedDelay=15000) public void heartbeat(){clients.forEach((id,emitters)->List.copyOf(emitters).forEach(emitter->{try{emitter.send(SseEmitter.event().name("heartbeat").comment("keepalive"));}catch(Exception e){remove(id,emitter);}}));}
 private void remove(UUID id,SseEmitter emitter){Set<SseEmitter> set=clients.get(id);if(set!=null){set.remove(emitter);if(set.isEmpty())clients.remove(id);} }
 public int connections(){return clients.values().stream().mapToInt(Set::size).sum();}
}
