package com.game_manager.gm.report;

import com.game_manager.gm.audit.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.jobs.JobService;
import com.game_manager.gm.report.dto.*;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class ReportService {
    public static final String JOB_TYPE = "REPORT_GENERATE";
    private static final Set<String> DEFINITIONS = Set.of("orders","reservations","revenue","workload");
    private final ReportRequestRepository requests; private final ReportScheduleRepository schedules; private final ReportTemplateRepository templates;
    private final CurrentUserProvider currentUser; private final JobService jobs; private final ObjectMapper mapper;
    private final AuditWriter audit; private final Clock clock; private final MeterRegistry metrics;

    public ReportService(ReportRequestRepository requests,ReportScheduleRepository schedules,ReportTemplateRepository templates,CurrentUserProvider currentUser,
            JobService jobs,ObjectMapper mapper,AuditWriter audit,Clock clock,MeterRegistry metrics){this.requests=requests;this.schedules=schedules;this.templates=templates;
        this.currentUser=currentUser;this.jobs=jobs;this.mapper=mapper;this.audit=audit;this.clock=clock;this.metrics=metrics;}

    public List<ReportDefinitionResponse> definitions(){requireRead();return List.of(
            definition("orders","Orders","Orders created in [from,to), with status and total"),
            definition("reservations","Reservations","Reservations starting in [from,to), with employee and duration"),
            definition("revenue","Revenue","Order count and gross total grouped by status"),
            definition("workload","Workload","Reservation count and booked minutes grouped by employee"));}

    @Transactional public ReportResponse generate(GenerateReportRequest input){AuthenticatedUser actor=requireRead();validate(input.definitionKey(),input.from(),input.to(),input.timezone());
        ReportRequest request=create(actor.id(),actor.role(),input.definitionKey(),input.format(),input.from(),input.to(),input.timezone(),input.locale());
        audit.write("REPORT_REQUESTED","REPORT",request.getId(),null,Map.of("definition",input.definitionKey(),"format",input.format()),null,AuditVisibility.OWNER_ONLY);
        return ReportResponse.from(requests.save(request));}

    private ReportRequest create(UUID owner,Role role,String definition,ReportFormat format,Instant from,Instant to,String timezone,String locale){
        ReportRequest request=new ReportRequest();request.setOwnerId(owner);request.setDefinitionKey(definition);request.setFormat(format);request.setStatus(ReportStatus.QUEUED);
        request.setFiltersJson(from+"|"+to);request.setPermissionSnapshot(String.join(",",RolePermissions.forRole(role).stream().map(Enum::name).sorted().toList()));
        request.setTimezone(timezone);request.setLocale(locale==null||locale.isBlank()?"sr-RS":locale);request.setSnapshotAt(clock.instant());request.setProgress(0);requests.saveAndFlush(request);
        UUID job=jobs.enqueue(JOB_TYPE,Map.of("reportId",request.getId()),"report:"+request.getId());request.setJobId(job);metrics.counter("gmanager.report.requests","definition",definition,"format",format.name()).increment();return request;}

    @Transactional(readOnly=true) public List<ReportResponse> list(){UUID owner=requireRead().id();return requests.findByOwnerIdOrderByCreatedAtDesc(owner).stream().map(ReportResponse::from).toList();}
    @Transactional(readOnly=true) public ReportResponse get(UUID id){return ReportResponse.from(owned(id,requireRead().id()));}
    @Transactional public ReportResponse cancel(UUID id){ReportRequest request=owned(id,requireRead().id());if(request.getStatus()==ReportStatus.QUEUED||request.getStatus()==ReportStatus.RUNNING){jobs.cancel(request.getJobId());request.setStatus(ReportStatus.CANCELLED);request.setProgress(0);}return ReportResponse.from(request);}
    @Transactional(readOnly=true) public UUID downloadDocument(UUID id){AuthenticatedUser actor=requireRead();ReportRequest request=owned(id,actor.id());if(request.getStatus()!=ReportStatus.COMPLETED||request.getDocumentId()==null||request.getExpiresAt()==null||!request.getExpiresAt().isAfter(clock.instant()))throw new ApplicationException(HttpStatus.GONE,"Report is not available");return request.getDocumentId();}

    @Transactional public ScheduleResponse createSchedule(ScheduleRequest input){AuthenticatedUser actor=requireManage();validate(input.definitionKey(),input.from(),input.to(),input.timezone());ReportSchedule value=new ReportSchedule();value.setOwnerId(actor.id());apply(value,input);return ScheduleResponse.from(schedules.save(value));}
    @Transactional(readOnly=true) public List<ScheduleResponse> schedules(){UUID owner=requireManage().id();return schedules.findByOwnerIdOrderByCreatedAtDesc(owner).stream().map(ScheduleResponse::from).toList();}
    @Transactional public ScheduleResponse updateSchedule(UUID id,long version,ScheduleRequest input){AuthenticatedUser actor=requireManage();ReportSchedule value=schedules.findById(id).filter(s->s.getOwnerId().equals(actor.id())).orElseThrow(this::notFound);if(value.getVersion()!=version)throw new ApplicationException(HttpStatus.CONFLICT,"Schedule changed; refresh and retry");validate(input.definitionKey(),input.from(),input.to(),input.timezone());apply(value,input);return ScheduleResponse.from(value);}
    @Transactional public void deleteSchedule(UUID id){AuthenticatedUser actor=requireManage();ReportSchedule value=schedules.findById(id).filter(s->s.getOwnerId().equals(actor.id())).orElseThrow(this::notFound);schedules.delete(value);}
    @Transactional(readOnly=true) public List<TemplateResponse> templates(){UUID owner=requireRead().id();return templates.findByOwnerIdOrderByName(owner).stream().map(TemplateResponse::from).toList();}
    @Transactional public TemplateResponse createTemplate(TemplateRequest input){AuthenticatedUser actor=requireRead();validate(input.definitionKey(),input.from(),input.to(),"UTC");ReportTemplate value=new ReportTemplate();value.setOwnerId(actor.id());value.setName(input.name().trim());value.setDefinitionKey(input.definitionKey());value.setFormat(input.format());value.setFiltersJson(input.from()+"|"+input.to());return TemplateResponse.from(templates.save(value));}
    @Transactional public void deleteTemplate(UUID id){AuthenticatedUser actor=requireRead();ReportTemplate value=templates.findById(id).filter(t->t.getOwnerId().equals(actor.id())).orElseThrow(this::notFound);templates.delete(value);}
    private void apply(ReportSchedule value,ScheduleRequest input){value.setDefinitionKey(input.definitionKey());value.setFormat(input.format());value.setFiltersJson(input.from()+"|"+input.to());value.setTimezone(input.timezone());value.setLocalTime(input.localTime());value.setDayOfWeek(input.dayOfWeek());value.setActive(true);value.setNextRunAt(next(input.timezone(),input.localTime(),input.dayOfWeek(),clock.instant()));}
    static Instant next(String timezone,LocalTime local,Integer day,Instant now){ZoneId zone=ZoneId.of(timezone);ZonedDateTime cursor=now.atZone(zone);LocalDate date=cursor.toLocalDate();if(day!=null){int delta=Math.floorMod(day-date.getDayOfWeek().getValue(),7);date=date.plusDays(delta);}ZonedDateTime candidate=ZonedDateTime.of(date,local,zone);if(!candidate.toInstant().isAfter(now))candidate=day==null?ZonedDateTime.of(date.plusDays(1),local,zone):ZonedDateTime.of(date.plusWeeks(1),local,zone);return candidate.toInstant();}
    private void validate(String definition,Instant from,Instant to,String timezone){if(!DEFINITIONS.contains(definition))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Unknown report definition");if(!from.isBefore(to)||Duration.between(from,to).toDays()>366)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Report range must be positive and at most 366 days");try{ZoneId.of(timezone);}catch(DateTimeException e){throw new ApplicationException(HttpStatus.BAD_REQUEST,"Invalid report timezone");}}
    private AuthenticatedUser requireRead(){AuthenticatedUser actor=currentUser.requireCurrentUser();if(!RolePermissions.has(actor.role(),Permission.REPORT_READ))throw new ApplicationException(HttpStatus.FORBIDDEN,"Report permission required");return actor;}
    private AuthenticatedUser requireManage(){AuthenticatedUser actor=currentUser.requireCurrentUser();if(!RolePermissions.has(actor.role(),Permission.REPORT_MANAGE))throw new ApplicationException(HttpStatus.FORBIDDEN,"Report management permission required");return actor;}
    private ReportRequest owned(UUID id,UUID owner){return requests.findById(id).filter(r->r.getOwnerId().equals(owner)).orElseThrow(this::notFound);}
    private ApplicationException notFound(){return new ApplicationException(HttpStatus.NOT_FOUND,"Report not found");}
    private static ReportDefinitionResponse definition(String key,String label,String metric){return new ReportDefinitionResponse(key,label,metric,List.of("CSV","XLSX","PDF"));}
}
