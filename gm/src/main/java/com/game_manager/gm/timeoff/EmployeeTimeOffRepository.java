package com.game_manager.gm.timeoff;

import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface EmployeeTimeOffRepository extends JpaRepository<EmployeeTimeOff,UUID> {
    List<EmployeeTimeOff> findAllByOrderByStartsAtAsc();
    @Query("select t from EmployeeTimeOff t where t.employeeId in :employees and t.status = :status and t.startsAt < :to and t.endsAt > :from")
    List<EmployeeTimeOff> approvedBetween(@Param("employees") Collection<UUID> employees,@Param("status") TimeOffStatus status,@Param("from") Instant from,@Param("to") Instant to);
    @Query("select count(t) from EmployeeTimeOff t where t.employeeId=:employee and t.status in :statuses and t.startsAt < :end and t.endsAt > :start and (:exclude is null or t.id <> :exclude)")
    long countOverlaps(@Param("employee") UUID employee,@Param("statuses") Collection<TimeOffStatus> statuses,@Param("start") Instant start,@Param("end") Instant end,@Param("exclude") UUID exclude);
}
