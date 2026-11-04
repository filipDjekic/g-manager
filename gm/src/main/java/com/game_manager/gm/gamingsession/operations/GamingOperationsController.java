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
    @GetMapping("/stations/{stationId}/history") public com.game_manager.gm.common.dto.PageResponse<StationHistoryResponse.Entry> history(@PathVariable UUID stationId,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return service.historyPage(stationId,page,size);}
    @PostMapping("/stations/{stationId}/force-lock")@ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)public void forceLock(@PathVariable UUID stationId){service.forceLock(stationId);}
    @PostMapping("/stations/{stationId}/confirm-locked")@ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)public void confirmLocked(@PathVariable UUID stationId){service.confirmLocked(stationId);}
}
