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
}
