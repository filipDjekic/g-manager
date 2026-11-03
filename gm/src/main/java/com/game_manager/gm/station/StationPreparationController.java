package com.game_manager.gm.station;
import jakarta.validation.Valid;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/gaming-operations/stations")
public class StationPreparationController {
    private final StationPreparationService service;
    @GetMapping("/{id}/preparation") public Map<String,Object> state(@PathVariable UUID id){return service.state(id);}
    @PostMapping("/{id}/prepare") public void prepare(@PathVariable UUID id,@Valid @RequestBody StationPreparationService.Preparation r){service.prepare(id,r);}
}
