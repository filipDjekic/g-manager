package com.game_manager.gm.waitlist;
import com.game_manager.gm.waitlist.dto.*;import jakarta.validation.Valid;import java.util.*;import lombok.RequiredArgsConstructor;import org.springframework.http.*;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/waitlist") @RequiredArgsConstructor
public class WaitlistController {private final WaitlistService service;
 @GetMapping public com.game_manager.gm.common.dto.PageResponse<WaitlistOperationalResponse> operational(
  @RequestParam(required=false) WaitlistStatus status, @RequestParam(required=false) String search,
  @RequestParam(required=false) UUID customerId,
  @RequestParam(required=false) @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate date,
  @RequestParam(required=false) UUID locationId, @RequestParam(required=false) UUID resourceId, @RequestParam(defaultValue="0") int page,
  @RequestParam(defaultValue="20") int size){return service.operational(status,search,customerId,date,locationId,resourceId,page,size);}
 @GetMapping("/me") public List<WaitlistResponse> mine(){return service.listMine();}
 @PostMapping public ResponseEntity<WaitlistResponse> join(@Valid @RequestBody CreateWaitlistRequest request){return ResponseEntity.status(HttpStatus.CREATED).body(service.join(request));}
 @PostMapping("/offers/{id}/accept") public WaitlistResponse accept(@PathVariable UUID id){return service.accept(id);}
 @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void cancel(@PathVariable UUID id,@RequestParam long version){service.cancel(id,version);}}
