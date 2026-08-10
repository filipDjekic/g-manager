package com.game_manager.gm.ai;
import com.game_manager.gm.ai.dto.*;import jakarta.validation.Valid;import java.util.UUID;import org.springframework.http.HttpStatus;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/ai") public class AiSummaryController {private final AiSummaryService service;public AiSummaryController(AiSummaryService service){this.service=service;}
 @PostMapping("/report-summaries/{reportId}") public AiReportSummaryResponse summarize(@PathVariable UUID reportId,@Valid @RequestBody AiSummaryRequest request){return service.summarize(reportId,request);}
 @PostMapping("/usage/{usageId}/feedback") @ResponseStatus(HttpStatus.NO_CONTENT) public void feedback(@PathVariable UUID usageId,@Valid @RequestBody AiFeedbackRequest request){service.feedback(usageId,request);}}
