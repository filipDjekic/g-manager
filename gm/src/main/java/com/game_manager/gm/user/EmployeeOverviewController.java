package com.game_manager.gm.user;

import com.game_manager.gm.user.dto.UserResponse;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/employees")
@RequiredArgsConstructor
public class EmployeeOverviewController {
    private final EmployeeOverviewService service;

    @GetMapping("/statistics")
    public EmployeeOverviewService.Statistics statistics() { return service.statistics(); }

    @GetMapping("/{id}")
    public UserResponse employee(@PathVariable UUID id) { return service.employee(id); }

    @GetMapping("/{id}/assignments")
    public EmployeeOverviewService.Assignments assignments(@PathVariable UUID id) { return service.assignments(id); }

    @GetMapping("/{id}/time-off")
    public List<EmployeeOverviewService.Leave> leaves(@PathVariable UUID id) { return service.leaves(id); }
}
