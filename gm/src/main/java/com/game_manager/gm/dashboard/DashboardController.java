package com.game_manager.gm.dashboard;

import com.game_manager.gm.dashboard.dto.DashboardSummaryResponse;
import com.game_manager.gm.dashboard.dto.DashboardTodayResponse;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
}
