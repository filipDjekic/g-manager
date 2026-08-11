package com.game_manager.gm.timeoff;
import com.game_manager.gm.timeoff.dto.*; import jakarta.validation.Valid; import java.util.*; import lombok.RequiredArgsConstructor; import org.springframework.http.*; import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/time-off") @RequiredArgsConstructor public class EmployeeTimeOffController {private final EmployeeTimeOffService service;
 @GetMapping public List<TimeOffResponse> list(){return service.list();}
 @PostMapping public ResponseEntity<TimeOffResponse> create(@Valid @RequestBody TimeOffRequest request){return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));}
 @PatchMapping("/{id}/status") public TimeOffResponse decide(@PathVariable UUID id,@Valid @RequestBody TimeOffDecisionRequest request){return service.decide(id,request);}}
