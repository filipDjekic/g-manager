package com.game_manager.gm.gamingsession.billing;

import jakarta.validation.Valid;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/gaming-billing")
public class GamingTimeController {
    private final GamingTimeService time;
    @GetMapping("/time-price") public GamingTimeService.TimePrice price(){return time.price();}
    @PutMapping("/time-price") public GamingTimeService.TimePrice price(@Valid @RequestBody GamingTimeService.TimePrice body){return time.savePrice(body);}
    @GetMapping("/customers/{id}/time") public Map<String,Object> account(@PathVariable UUID id){return time.account(id);}
    @GetMapping("/customers/{id}/time/{kind}") public com.game_manager.gm.common.dto.PageResponse<Map<String,Object>> history(@PathVariable UUID id,@PathVariable String kind,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size){return time.history(id,kind,page,size);}
    @PostMapping("/customers/{id}/time-grants") public Map<String,Object> grant(@PathVariable UUID id,@Valid @RequestBody GamingTimeService.Grant body,@RequestHeader("Idempotency-Key") String key){return time.grant(id,body,key);}
    @PostMapping("/assignments") public Map<String,Object> assign(@Valid @RequestBody GamingTimeService.Assignment body){return time.assign(body);}
    @PostMapping("/assignments/{id}/cancel") public void cancel(@PathVariable UUID id){time.cancel(id);}
}
