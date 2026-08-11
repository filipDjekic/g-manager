package com.game_manager.gm.dashboard;

import com.game_manager.gm.dashboard.dto.DashboardSummaryResponse;
import com.game_manager.gm.dashboard.dto.DashboardTodayResponse;
import com.game_manager.gm.dashboard.dto.DashboardTrendsResponse;
import com.game_manager.gm.dashboard.dto.DashboardWorkloadResponse;
import com.game_manager.gm.dashboard.dto.DashboardWidgetPreferenceRequest;
import com.game_manager.gm.dashboard.dto.DashboardWidgetPreferenceResponse;
import com.game_manager.gm.dashboard.dto.DashboardAttentionResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {
    private final DashboardService dashboardService;

    @GetMapping("/summary")
    public DashboardSummaryResponse summary(
            @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return dashboardService.summary(from, to);
    }

    @GetMapping("/today")
    public DashboardTodayResponse today() {
        return dashboardService.today();
    }

    @GetMapping("/attention")
    public DashboardAttentionResponse attention() {
        return dashboardService.attention();
    }

    @GetMapping("/trends")
    public DashboardTrendsResponse trends(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        return dashboardService.trends(from, to);
    }

    @GetMapping("/workload")
    public DashboardWorkloadResponse workload(@RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(required = false) UUID employeeId) {
        return dashboardService.workload(from, to, employeeId);
    }

    @GetMapping(value = "/export", produces = "text/csv")
    public ResponseEntity<byte[]> export(@RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(required = false) UUID employeeId,
            @RequestParam(defaultValue = "current") String view) {
        boolean raw = switch (view) {
            case "raw" -> true;
            case "current" -> false;
            default -> throw new com.game_manager.gm.common.error.ApplicationException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Export view must be current or raw");
        };
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=dashboard-" + from + "-" + to + ".csv")
                .body(dashboardService.export(from, to, employeeId, raw));
    }

    @GetMapping("/widget-preferences")
    public List<DashboardWidgetPreferenceResponse> widgetPreferences() {
        return dashboardService.widgetPreferences();
    }

    @PutMapping("/widget-preferences")
    public List<DashboardWidgetPreferenceResponse> saveWidgetPreferences(
            @Valid @RequestBody List<@Valid DashboardWidgetPreferenceRequest> requests) {
        return dashboardService.saveWidgetPreferences(requests);
    }
}
