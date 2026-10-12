package com.game_manager.gm.waitlist;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.waitlist.dto.*;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/waitlist") @RequiredArgsConstructor
public class WaitlistController {
    private final WaitlistService service;
    @GetMapping public PageResponse<WaitlistOperationalResponse> operational(
            @RequestParam(required=false) String status, @RequestParam(required=false) String search,
            @RequestParam(required=false) UUID customerId,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required=false) UUID serviceId, @RequestParam(required=false) UUID locationId,
            @RequestParam(required=false) UUID areaId, @RequestParam(required=false) UUID resourceId,
            @RequestParam(defaultValue="FIFO") String sort, @RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size) {
        return service.operational(status,search,customerId,date,serviceId,locationId,areaId,resourceId,sort,page,size);
    }
    @GetMapping("/statistics") public WaitlistStatistics statistics() { return service.statistics(); }
    @GetMapping("/management-scope") public WaitlistAccessPolicy.Scope scope() { return service.managementScope(); }
    @GetMapping("/management/{id}") public WaitlistDetailResponse detail(@PathVariable UUID id) { return service.detail(id); }
    @PostMapping("/management") public ResponseEntity<WaitlistDetailResponse> create(
            @Valid @RequestBody ManageWaitlistRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createManaged(request));
    }
    @PatchMapping("/management/{id}") public WaitlistDetailResponse update(
            @PathVariable UUID id,@Valid @RequestBody ManageWaitlistRequest request) { return service.updateManaged(id,request); }
    @DeleteMapping("/management/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelManaged(@PathVariable UUID id,@Valid @RequestBody CancelWaitlistRequest request) { service.cancelManaged(id,request); }
    @GetMapping("/me") public List<WaitlistResponse> mine() { return service.listMine(); }
    @PostMapping public ResponseEntity<WaitlistResponse> join(@Valid @RequestBody CreateWaitlistRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.join(request));
    }
    @PostMapping("/offers/{id}/accept") public WaitlistResponse accept(@PathVariable UUID id) { return service.accept(id); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable UUID id,@RequestParam long version) { service.cancel(id,version); }
}
