package com.game_manager.gm.ai;

import com.game_manager.gm.ai.dto.*;
import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.feature.*;
import com.game_manager.gm.report.ReportService;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiSummaryService {
    static final String PROMPT_VERSION="report-summary-v1",OUTPUT_VERSION="report-summary-response-v1";
    private final ReportService reports;private final CurrentUserProvider users;private final FeatureFlagService flags;
    private final AiSummaryProvider provider;private final AiUsageRepository usage;private final AiProperties config;
    private final AuditWriter audit;private final MeterRegistry metrics;private final Clock clock;
    public AiSummaryService(ReportService reports,CurrentUserProvider users,FeatureFlagService flags,AiSummaryProvider provider,
            AiUsageRepository usage,AiProperties config,AuditWriter audit,MeterRegistry metrics,Clock clock){this.reports=reports;this.users=users;this.flags=flags;this.provider=provider;this.usage=usage;this.config=config;this.audit=audit;this.metrics=metrics;this.clock=clock;}

    public synchronized AiReportSummaryResponse summarize(UUID reportId,AiSummaryRequest request){
        AuthenticatedUser actor=users.requireCurrentUser();if(!request.consent())throw new ApplicationException(HttpStatus.BAD_REQUEST,"Explicit AI processing consent is required");
        if(!flags.enabled(FeatureFlag.AI_ASSISTANT,actor.id()))throw new ApplicationException(HttpStatus.NOT_FOUND,"AI assistant is unavailable");
        ReportService.AiSummarySource source=reports.aiSummarySource(reportId);
        Instant day=clock.instant().atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant();
        if(usage.tokensSince(actor.id(),day)+config.maxInputTokens()+config.maxOutputTokens()>config.dailyTokenLimit())throw new ApplicationException(HttpStatus.TOO_MANY_REQUESTS,"Daily AI token limit reached");
        long started=System.nanoTime();boolean generated=false;String summary;String limitations;int input=0,output=0;String status="FALLBACK";
        try{AiSummaryProvider.Result result=provider.summarize(new AiSummaryProvider.Input(PROMPT_VERSION,source.definition(),source.rowCount(),source.snapshotAt().toString(),config.maxOutputTokens()));summary=result.summary();limitations=result.limitations();input=result.inputTokens();output=result.outputTokens();generated=true;status="COMPLETED";}
        catch(AiProviderException exception){summary=fallback(source);limitations="AI provider nije dostupan. Prikazan je deterministički sažetak metapodataka izveštaja.";metrics.counter("gmanager.ai.provider.errors","provider",safeProvider()).increment();}
        long latency=Duration.ofNanos(System.nanoTime()-started).toMillis();AiUsageEvent event=new AiUsageEvent();event.setOwnerId(actor.id());event.setReportId(reportId);event.setProvider(safeProvider());event.setModel(config.model());event.setPromptVersion(PROMPT_VERSION);event.setOutputVersion(OUTPUT_VERSION);event.setStatus(status);event.setInputTokens(input);event.setOutputTokens(output);event.setLatencyMs(latency);usage.saveAndFlush(event);
        audit.write("AI_REPORT_SUMMARY_USED","AI_USAGE",event.getId(),null,Map.of("reportId",reportId,"status",status,"promptVersion",PROMPT_VERSION,"tokens",input+output),null,AuditVisibility.OWNER_ONLY);
        metrics.timer("gmanager.ai.latency","provider",safeProvider(),"status",status).record(Duration.ofMillis(latency));metrics.counter("gmanager.ai.tokens","provider",safeProvider()).increment(input+output);
        return response(event,generated,summary,limitations,source);
    }
    @Transactional public void feedback(UUID id,AiFeedbackRequest request){AuthenticatedUser actor=users.requireCurrentUser();AiUsageEvent event=usage.findById(id).filter(value->value.getOwnerId().equals(actor.id())).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"AI usage not found"));event.setFeedback(request.feedback());audit.write("AI_REPORT_SUMMARY_FEEDBACK","AI_USAGE",id,null,Map.of("feedback",request.feedback()),null,AuditVisibility.OWNER_ONLY);metrics.counter("gmanager.ai.feedback","value",request.feedback()).increment();}
    private AiReportSummaryResponse response(AiUsageEvent event,boolean generated,String summary,String limitations,ReportService.AiSummarySource source){return new AiReportSummaryResponse(event.getId(),generated,summary,limitations,List.of(new AiReportSummaryResponse.Source(source.reportId(),source.definition(),source.rowCount(),source.snapshotAt().toString())),PROMPT_VERSION,OUTPUT_VERSION);}
    private static String fallback(ReportService.AiSummarySource value){return "Izveštaj '"+value.definition()+"' sadrži "+value.rowCount()+" redova i napravljen je iz preseka "+value.snapshotAt()+".";}
    private String safeProvider(){return config.provider().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]","unknown");}
}
