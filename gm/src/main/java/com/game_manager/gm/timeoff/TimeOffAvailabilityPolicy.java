package com.game_manager.gm.timeoff;

import com.game_manager.gm.common.error.ApplicationException;
import java.time.Instant; import java.util.*;
import lombok.RequiredArgsConstructor; import org.springframework.http.HttpStatus; import org.springframework.stereotype.Component; import org.springframework.transaction.annotation.Transactional;

@Component @RequiredArgsConstructor
public class TimeOffAvailabilityPolicy {
 private final EmployeeTimeOffRepository repository;
 @Transactional(readOnly=true) public List<TimeOffInterval> approvedBetween(Collection<UUID> employees,Instant from,Instant to){if(employees.isEmpty())return List.of();return repository.approvedBetween(employees,TimeOffStatus.APPROVED,from,to).stream().map(v->new TimeOffInterval(v.getEmployeeId(),v.getStartsAt(),v.getEndsAt())).toList();}
 @Transactional(readOnly=true) public boolean isAvailable(UUID employee,Instant start,Instant end){return approvedBetween(List.of(employee),start,end).isEmpty();}
 public void requireAvailable(UUID employee,Instant start,Instant end){if(!isAvailable(employee,start,end))throw new ApplicationException(HttpStatus.CONFLICT,"Employee is on approved time off");}
}
