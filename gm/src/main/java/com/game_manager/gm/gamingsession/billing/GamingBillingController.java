package com.game_manager.gm.gamingsession.billing;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/gaming-billing") @RequiredArgsConstructor
public class GamingBillingController {
    private final GamingFinanceReportService reports;
    @GetMapping("/report/{table}") public com.game_manager.gm.common.dto.PageResponse<Map<String,Object>> reportDetails(@PathVariable String table,@RequestParam java.time.Instant from,@RequestParam java.time.Instant until,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return reports.details(table,from,until,page,size);}
    @GetMapping("/report") public Map<String,Object> report(@RequestParam java.time.Instant from,@RequestParam java.time.Instant until){return reports.report(from,until);}
}
