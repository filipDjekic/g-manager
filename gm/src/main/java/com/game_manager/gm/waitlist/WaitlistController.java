package com.game_manager.gm.waitlist;
import com.game_manager.gm.waitlist.dto.*;import jakarta.validation.Valid;import java.util.*;import lombok.RequiredArgsConstructor;import org.springframework.http.*;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/waitlist") @RequiredArgsConstructor
public class WaitlistController {private final WaitlistService service;
 @GetMapping("/me") public List<WaitlistResponse> mine(){return service.listMine();}
 @PostMapping public ResponseEntity<WaitlistResponse> join(@Valid @RequestBody CreateWaitlistRequest request){return ResponseEntity.status(HttpStatus.CREATED).body(service.join(request));}
 @PostMapping("/offers/{id}/accept") public WaitlistResponse accept(@PathVariable UUID id){return service.accept(id);}
 @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void cancel(@PathVariable UUID id,@RequestParam long version){service.cancel(id,version);}}
