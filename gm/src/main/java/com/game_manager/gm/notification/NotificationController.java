package com.game_manager.gm.notification;
import com.game_manager.gm.notification.dto.*; import jakarta.validation.Valid; import java.util.List; import java.util.UUID; import lombok.RequiredArgsConstructor; import org.springframework.http.MediaType; import org.springframework.web.bind.annotation.*; import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
@RestController @RequestMapping("/api/v1/notifications") @RequiredArgsConstructor public class NotificationController {
 private final NotificationService service; @GetMapping public NotificationPageResponse list(){return service.list();}
 @PatchMapping("/{id}/read") public NotificationResponse read(@PathVariable UUID id){return service.read(id);}
 @PatchMapping("/read-all") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void readAll(){service.readAll();}
 @GetMapping("/{id}/open") public NotificationOpenResponse open(@PathVariable UUID id){return service.open(id);}
 @GetMapping("/preferences") public List<NotificationPreferenceResponse> preferences(){return service.preferenceList();}
 @PutMapping("/preferences") public NotificationPreferenceResponse preference(@Valid @RequestBody NotificationPreferenceRequest request){return service.savePreference(request);}
 @GetMapping(value="/stream",produces=MediaType.TEXT_EVENT_STREAM_VALUE) public SseEmitter stream(@RequestHeader(name="Last-Event-ID",required=false)String lastEventId){return service.connect(lastEventId);}
}
