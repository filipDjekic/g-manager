package com.game_manager.gm.gamingsession;

import com.game_manager.gm.gamingsession.dto.*;
import jakarta.validation.Valid;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import com.game_manager.gm.gamingsession.realtime.GamingSessionRealtimeHub;

@RestController
@RequestMapping("/api/v1/gaming-sessions")
@RequiredArgsConstructor
public class GamingSessionController {
    private final GamingSessionService service;
    private final GamingSessionRealtimeHub realtime;

    @PostMapping public ResponseEntity<GamingSessionResponse> start(@Valid @RequestBody StartGamingSessionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.start(request));
    }
    @PostMapping("/{id}/extend") public GamingSessionResponse extend(@PathVariable UUID id,
            @Valid @RequestBody ExtendGamingSessionRequest request) { return service.extend(id, request); }
    @PostMapping("/{id}/terminate") public GamingSessionResponse terminate(@PathVariable UUID id,
            @Valid @RequestBody TerminateGamingSessionRequest request) { return service.terminate(id, request); }
    @GetMapping("/{id}") public GamingSessionResponse get(@PathVariable UUID id) { return service.get(id); }
    @GetMapping public List<GamingSessionResponse> active() { return service.active(); }
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() { return realtime.connect(); }
}
