package com.game_manager.gm.availability;

import com.game_manager.gm.availability.dto.*;
import com.game_manager.gm.catalog.*;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.reservation.BookingAvailabilityPolicy;
import com.game_manager.gm.user.*;
import com.game_manager.gm.workinghours.WorkingHoursService;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AvailabilityService {
    static final int SLOT_INCREMENT_MINUTES=15;
    static final long MAX_RANGE_DAYS=31;
    private final CatalogService catalogService;
    private final UserRepository userRepository;
    private final WorkingHoursService workingHoursService;
    private final BookingAvailabilityPolicy bookingPolicy;
    private final Clock clock;

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('CATALOG_READ')")
    public AvailabilityResponse find(AvailabilityQuery query) { return findInternal(query,false); }

    @Transactional(readOnly=true)
    @PreAuthorize("hasAuthority('CATALOG_READ')")
    public AvailabilityResponse overview(AvailabilityQuery query) { return findInternal(query,true); }

    private AvailabilityResponse findInternal(AvailabilityQuery query,boolean includeOccupied) {
        long days=ChronoUnit.DAYS.between(query.from(),query.to());
        if(days<0||days>=MAX_RANGE_DAYS)throw new ApplicationException(HttpStatus.BAD_REQUEST,"Availability range must contain between 1 and 31 days");
        CatalogItem service=catalogService.getActiveById(query.serviceId());
        if(service.getType()!=ItemType.SERVICE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Catalog item is not a service");
        List<User> employees=employees(query.employeeId());
        ZoneId zone=workingHoursService.getBusinessZone();
        Instant from=query.from().atStartOfDay(zone).toInstant(),to=query.to().plusDays(1).atStartOfDay(zone).toInstant();
        var snapshot=bookingPolicy.prepare(service.getId(),query.resourceId(),query.locationId(),employees.stream().map(User::getId).toList(),
                from,to.plus(service.getDurationMinutes(),ChronoUnit.MINUTES),null);
        List<EmployeeAvailabilityResponse> result=new ArrayList<>();
        for(User employee:employees) {
            List<AvailabilitySlotResponse> slots=new ArrayList<>();
            for(Instant start:snapshot.starts(from,to,SLOT_INCREMENT_MINUTES)) {
                Instant end=start.plus(service.getDurationMinutes(),ChronoUnit.MINUTES);
                var state=snapshot.assess(employee.getId(),start,end);
                if(!includeOccupied&&!state.available())continue;
                var resource=state.resource();
                slots.add(new AvailabilitySlotResponse(start,end,resource==null?null:resource.id(),resource==null?null:resource.code(),
                        resource==null?null:resource.name(),state.locationId(),state.locationName(),state.status(),state.reason()));
            }
            result.add(new EmployeeAvailabilityResponse(employee.getId(),employee.getName(),slots));
        }
        var selected=result.stream().flatMap(e->e.slots().stream()).filter(s->Objects.equals(s.resourceId(),query.resourceId())).findFirst().orElse(null);
        return new AvailabilityResponse(zone.getId(),service.getId(),service.getName(),service.getDurationMinutes(),SLOT_INCREMENT_MINUTES,
                query.from(),query.to(),result,query.resourceId(),selected==null?null:selected.resourceName(),
                snapshot.resourceRequired(),clock.instant());
    }

    private List<User> employees(UUID employeeId) {
        if(employeeId==null)return userRepository.findByRoleAndActiveTrueAndDeletedAtIsNull(Role.EMPLOYEE).stream()
                .sorted(Comparator.comparing(User::getName).thenComparing(User::getId)).toList();
        User employee=userRepository.findById(employeeId).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Employee not found"));
        if(!employee.isActive()||employee.getRole()!=Role.EMPLOYEE)throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Selected user is not an active employee");
        return List.of(employee);
    }
}
