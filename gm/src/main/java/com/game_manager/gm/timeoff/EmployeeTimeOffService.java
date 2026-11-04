package com.game_manager.gm.timeoff;

import com.game_manager.gm.audit.*; import com.game_manager.gm.common.error.ApplicationException; import com.game_manager.gm.timeoff.dto.*; import com.game_manager.gm.user.*;
import java.time.Clock; import java.util.*; import lombok.RequiredArgsConstructor; import org.springframework.http.HttpStatus; import org.springframework.security.access.prepost.PreAuthorize; import org.springframework.stereotype.Service; import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class EmployeeTimeOffService {
 private final EmployeeTimeOffRepository repository; private final UserRepository users; private final AuditWriter audit; private final Clock clock;
 @Transactional @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')") public TimeOffResponse create(TimeOffRequest request){
  User employee=users.findById(request.employeeId()).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Employee not found"));
  if(employee.getRole()!=com.game_manager.gm.common.security.Role.EMPLOYEE||!employee.isActive())throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected user is not an active employee");
  validateRange(request.startsAt(),request.endsAt()); requireNoOverlap(request.employeeId(),request.startsAt(),request.endsAt(),null);
  EmployeeTimeOff value=new EmployeeTimeOff();value.setEmployeeId(request.employeeId());value.setStartsAt(request.startsAt());value.setEndsAt(request.endsAt());value.setReason(request.reason().trim());value.setStatus(TimeOffStatus.PENDING);
  value=repository.saveAndFlush(value);audit.write("TIME_OFF_CREATED","EMPLOYEE_TIME_OFF",value.getId(),null,data(value),null,AuditVisibility.MANAGEMENT);return TimeOffResponse.from(value);}
 @Transactional @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')") public TimeOffResponse decide(UUID id,TimeOffDecisionRequest request){EmployeeTimeOff value=require(id);if(!Objects.equals(value.getVersion(),request.version()))throw new ApplicationException(HttpStatus.CONFLICT,"Resource was changed; refresh and try again");
  if(request.status()!=TimeOffStatus.APPROVED&&request.status()!=TimeOffStatus.REJECTED&&request.status()!=TimeOffStatus.CANCELLED)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Unsupported time-off transition");
  if(value.getStatus()==TimeOffStatus.REJECTED||value.getStatus()==TimeOffStatus.CANCELLED||value.getStatus()==TimeOffStatus.APPROVED&&request.status()!=TimeOffStatus.CANCELLED)throw new ApplicationException(HttpStatus.CONFLICT,"Time-off transition is not allowed");
  if(request.status()==TimeOffStatus.APPROVED){if(!value.getEndsAt().isAfter(clock.instant()))throw new ApplicationException(HttpStatus.CONFLICT,"Past time off cannot be approved");requireNoOverlap(value.getEmployeeId(),value.getStartsAt(),value.getEndsAt(),value.getId());}
  Map<String,Object> before=data(value);value.setStatus(request.status());value.setDecisionReason(request.reason()==null||request.reason().isBlank()?null:request.reason().trim());value=repository.saveAndFlush(value);
  audit.write("TIME_OFF_"+request.status(),"EMPLOYEE_TIME_OFF",value.getId(),before,data(value),value.getDecisionReason(),AuditVisibility.MANAGEMENT);return TimeOffResponse.from(value);}
 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')")
 public com.game_manager.gm.common.dto.PageResponse<TimeOffResponse> page(String search,TimeOffStatus status,UUID employeeId,java.time.Instant from,java.time.Instant to,int page,int size){
  if(from!=null&&to!=null&&!from.isBefore(to))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Time-off filter end must be after start");
  boolean email=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream().anyMatch(a->a.getAuthority().equals("USER_LIST"));
  org.springframework.data.jpa.domain.Specification<EmployeeTimeOff> spec=(row,query,cb)->{
   var predicates=new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
   if(status!=null)predicates.add(cb.equal(row.get("status"),status));
   if(employeeId!=null)predicates.add(cb.equal(row.get("employeeId"),employeeId));
   if(from!=null)predicates.add(cb.greaterThan(row.get("endsAt"),from));
   if(to!=null)predicates.add(cb.lessThan(row.get("startsAt"),to));
   if(search!=null&&!search.isBlank()){
    var sub=query.subquery(UUID.class);var user=sub.from(User.class);String term="%"+search.trim().toLowerCase(java.util.Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
    var name=cb.like(cb.lower(user.get("name")),term,'\\');
    sub.select(user.get("id")).where(email?cb.or(name,cb.like(cb.lower(user.get("email")),term,'\\')):name);
    predicates.add(row.get("employeeId").in(sub));
   }
   return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
  };
  return com.game_manager.gm.common.dto.PageResponse.from(repository.findAll(spec,com.game_manager.gm.common.dto.PageRequests.of(page,size,org.springframework.data.domain.Sort.by("startsAt","id"))).map(TimeOffResponse::from));
 }
 @Transactional(readOnly=true) @PreAuthorize("hasAuthority('WORKING_HOURS_MANAGE')") public Map<String,Long> summary(){return Map.of("totalElements",repository.countByStatusInAndEndsAtAfter(List.of(TimeOffStatus.PENDING,TimeOffStatus.APPROVED),clock.instant()));}
 private void validateRange(java.time.Instant start,java.time.Instant end){if(!end.isAfter(start))throw new ApplicationException(HttpStatus.BAD_REQUEST,"Time-off end must be after start");}
 private void requireNoOverlap(UUID employee,java.time.Instant start,java.time.Instant end,UUID exclude){if(repository.countOverlaps(employee,List.of(TimeOffStatus.PENDING,TimeOffStatus.APPROVED),start,end,exclude)>0)throw new ApplicationException(HttpStatus.CONFLICT,"Employee time off overlaps an existing request");}
 private EmployeeTimeOff require(UUID id){return repository.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Time off not found"));}
 private Map<String,Object> data(EmployeeTimeOff v){Map<String,Object>d=new LinkedHashMap<>();d.put("employeeId",v.getEmployeeId());d.put("startsAt",v.getStartsAt());d.put("endsAt",v.getEndsAt());d.put("status",v.getStatus());d.put("reason",v.getReason());d.put("decisionReason",v.getDecisionReason());return d;}
}
