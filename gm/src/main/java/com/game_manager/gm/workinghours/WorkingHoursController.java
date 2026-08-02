package com.game_manager.gm.workinghours;

import com.game_manager.gm.workinghours.dto.UpdateWorkingHoursRequest;
import com.game_manager.gm.workinghours.dto.WorkingHoursExceptionRequest;
import com.game_manager.gm.workinghours.dto.WorkingHoursExceptionResponse;
import com.game_manager.gm.workinghours.dto.WorkingHoursResponse;
import jakarta.validation.Valid;
import java.time.DayOfWeek;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/working-hours")
@RequiredArgsConstructor
public class WorkingHoursController {
    private final WorkingHoursService workingHoursService;

    @GetMapping
    public List<WorkingHoursResponse> list() {
        return workingHoursService.list();
    }

    @PutMapping("/{dayOfWeek}")
    public WorkingHoursResponse update(
            @PathVariable DayOfWeek dayOfWeek,
            @Valid @RequestBody UpdateWorkingHoursRequest request) {
        return workingHoursService.update(dayOfWeek, request);
    }

    @GetMapping("/exceptions")
    public List<WorkingHoursExceptionResponse> listExceptions() {
        return workingHoursService.listExceptions();
    }

    @PostMapping("/exceptions")
    public ResponseEntity<WorkingHoursExceptionResponse> createException(
            @Valid @RequestBody WorkingHoursExceptionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workingHoursService.createException(request));
    }

    @PutMapping("/exceptions/{id}")
    public WorkingHoursExceptionResponse updateException(
            @PathVariable UUID id,
            @Valid @RequestBody WorkingHoursExceptionRequest request) {
        return workingHoursService.updateException(id, request);
    }

    @DeleteMapping("/exceptions/{id}")
    public ResponseEntity<Void> deleteException(
            @PathVariable UUID id, @RequestParam long version) {
        workingHoursService.deleteException(id, version);
        return ResponseEntity.noContent().build();
    }
}
