package com.gmanager.gmanager.reservation.controller;

import com.gmanager.gmanager.reservation.dto.UpsertWorkingHoursRequest;
import com.gmanager.gmanager.reservation.dto.WorkingHoursResponse;
import com.gmanager.gmanager.reservation.service.WorkingHoursService;
import com.gmanager.gmanager.security.authorization.IsOwnerOrAdmin;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/working-hours")
public class WorkingHoursController {

    private final WorkingHoursService workingHoursService;

    public WorkingHoursController(WorkingHoursService workingHoursService) {
        this.workingHoursService = workingHoursService;
    }

    @GetMapping
    public List<WorkingHoursResponse> getAll() {
        return workingHoursService.getAll();
    }

    @PutMapping
    @IsOwnerOrAdmin
    public WorkingHoursResponse upsert(@Valid @RequestBody UpsertWorkingHoursRequest request) {
        return workingHoursService.upsert(request);
    }
}