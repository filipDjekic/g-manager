package com.game_manager.gm.report;

import com.game_manager.gm.document.DocumentService;
import com.game_manager.gm.jobs.*;
import com.game_manager.gm.notification.NotificationService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Component
public class ReportJobHandler implements JobHandler {
    private final ReportRequestRepository requests; private final ReportGenerator generator; private final DocumentService documents;
    private final ObjectMapper mapper; private final Clock clock; private final MeterRegistry metrics; private final NotificationService notifications;
    public ReportJobHandler(ReportRequestRepository requests,ReportGenerator generator,DocumentService documents,ObjectMapper mapper,Clock clock,MeterRegistry metrics,NotificationService notifications){this.requests=requests;this.generator=generator;this.documents=documents;this.mapper=mapper;this.clock=clock;this.metrics=metrics;this.notifications=notifications;}
    @Override public String type(){return ReportService.JOB_TYPE;}
    @Override public void handle(JobRecord job,JobContext context){UUID id=UUID.fromString(mapper.readTree(job.payload()).get("reportId").asText());ReportRequest request=start(id);context.checkCancellation();Timer.Sample timer=Timer.start(metrics);try{boolean broad=request.getPermissionSnapshot().contains("ORDER_READ_ALL")&&request.getPermissionSnapshot().contains("RESERVATION_READ_ALL");ReportGenerator.Generated generated=generator.generate(request,broad?null:request.getOwnerId());context.checkCancellation();UUID document=documents.storeGenerated(request.getOwnerId(),request.getDefinitionKey()+"-"+request.getSnapshotAt().toString().replace(':','-')+"."+generated.extension(),generated.contentType(),generated.bytes());complete(id,document,generated.rows(),generated.bytes().length);metrics.counter("gmanager.report.outcomes","result","completed").increment();}catch(RuntimeException exception){fail(id);metrics.counter("gmanager.report.outcomes","result","failed").increment();throw exception;}finally{timer.stop(metrics.timer("gmanager.report.duration","definition",request.getDefinitionKey()));}}
    @Transactional protected ReportRequest start(UUID id){ReportRequest value=requests.findById(id).orElseThrow();if(value.getStatus()==ReportStatus.CANCELLED)throw new JobCancelledException();value.setStatus(ReportStatus.RUNNING);value.setProgress(10);return requests.saveAndFlush(value);}
    @Transactional protected void complete(UUID id,UUID document,long rows,long bytes){ReportRequest value=requests.findById(id).orElseThrow();value.setDocumentId(document);value.setRowCount(rows);value.setProgress(100);value.setStatus(ReportStatus.COMPLETED);value.setExpiresAt(clock.instant().plus(30,ChronoUnit.DAYS));requests.saveAndFlush(value);notifications.reportCompleted(value.getOwnerId(),value.getId(),value.getDefinitionKey());metrics.summary("gmanager.report.rows").record(rows);metrics.summary("gmanager.report.bytes").record(bytes);}
    @Transactional protected void fail(UUID id){requests.findById(id).ifPresent(value->{if(value.getStatus()!=ReportStatus.CANCELLED){value.setStatus(ReportStatus.FAILED);value.setErrorMessage("Report generation failed");requests.saveAndFlush(value);}});}
}
