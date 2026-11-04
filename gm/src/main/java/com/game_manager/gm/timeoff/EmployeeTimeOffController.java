package com.game_manager.gm.timeoff;
import com.game_manager.gm.timeoff.dto.*; import jakarta.validation.Valid; import java.util.*; import lombok.RequiredArgsConstructor; import org.springframework.http.*; import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/time-off") @RequiredArgsConstructor public class EmployeeTimeOffController {private final EmployeeTimeOffService service;
 @GetMapping("/summary") public Map<String,Long> summary(){return service.summary();}
 @GetMapping({"","/page"}) public com.game_manager.gm.common.dto.PageResponse<TimeOffResponse> page(@RequestParam(required=false)String search,@RequestParam(required=false)TimeOffStatus status,@RequestParam(required=false)UUID employeeId,@RequestParam(required=false)java.time.Instant from,@RequestParam(required=false)java.time.Instant to,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="10")int size){return service.page(search,status,employeeId,from,to,page,size);}
 @PostMapping public ResponseEntity<TimeOffResponse> create(@Valid @RequestBody TimeOffRequest request){return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));}
 @PatchMapping("/{id}/status") public TimeOffResponse decide(@PathVariable UUID id,@Valid @RequestBody TimeOffDecisionRequest request){return service.decide(id,request);}}
