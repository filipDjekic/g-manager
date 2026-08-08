package com.game_manager.gm.audit;

import com.game_manager.gm.audit.dto.AuditEventResponse;
import com.game_manager.gm.common.dto.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/audit-events")
@RequiredArgsConstructor
public class AuditController {
    private final AuditService service;

    @GetMapping
    public PageResponse<AuditEventResponse> list(@RequestParam(required = false) String action,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "DESC") String direction) {
        return service.list(action, resourceType, actorId, from, to, page, size, sort, direction);
    }

    @GetMapping("/{id}")
    public AuditEventResponse get(@PathVariable UUID id) { return service.get(id); }
}
