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

    @PostMapping("/{id}/finish") public GamingSessionResponse finish(@PathVariable UUID id) { return service.finishOwn(id); }
    @PostMapping("/{id}/terminate") public GamingSessionResponse terminate(@PathVariable UUID id,
            @Valid @RequestBody TerminateGamingSessionRequest request) { return service.terminate(id, request); }
    @GetMapping("/{id}") public GamingSessionResponse get(@PathVariable UUID id) { return service.get(id); }
    @GetMapping public List<GamingSessionResponse> active() { return service.active(); }
    @GetMapping({"/me","/me/history"}) public com.game_manager.gm.common.dto.PageResponse<GamingSessionVisitResponse> myHistory(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="10")int size){return service.myVisitPage(page,size);}
    @GetMapping({"/customer/{customerId}","/customer/{customerId}/history"}) public com.game_manager.gm.common.dto.PageResponse<GamingSessionVisitResponse> customerHistory(@PathVariable UUID customerId,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="10")int size){return service.customerVisitPage(customerId,page,size);}
    @GetMapping("/me/active") public List<GamingSessionVisitResponse> mine() { return service.myVisits(); }
    @GetMapping("/customer/{customerId}/active") public List<GamingSessionVisitResponse> customerVisits(
            @PathVariable UUID customerId) { return service.customerVisits(customerId); }
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() { return realtime.connect(); }
}
