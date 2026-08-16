package com.game_manager.gm.gamingsession.operations;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/gaming-operations")
@RequiredArgsConstructor
public class GamingOperationsController {
    private final GamingOperationsBoardService service;
    @GetMapping("/board")
    public GamingOperationsBoardResponse board(@RequestParam(required = false) UUID locationId) {
        return service.board(locationId);
    }
    @GetMapping("/stations/{stationId}/history") public StationHistoryResponse history(@PathVariable UUID stationId){return service.history(stationId);}
    @PostMapping("/stations/{stationId}/force-lock")@ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)public void forceLock(@PathVariable UUID stationId){service.forceLock(stationId);}
    @PostMapping("/stations/{stationId}/confirm-locked")@ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)public void confirmLocked(@PathVariable UUID stationId){service.confirmLocked(stationId);}
}
