package com.gmanager.gmanager.reservation.service;

import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.reservation.domain.WorkingHours;
import com.gmanager.gmanager.reservation.dto.UpsertWorkingHoursRequest;
import com.gmanager.gmanager.reservation.dto.WorkingHoursResponse;
import com.gmanager.gmanager.reservation.repository.WorkingHoursRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

@Service
public class WorkingHoursService {

    private final WorkingHoursRepository workingHoursRepository;

    public WorkingHoursService(WorkingHoursRepository workingHoursRepository) {
        this.workingHoursRepository = workingHoursRepository;
    }

    @Transactional(readOnly = true)
    public List<WorkingHoursResponse> getAll() {
        return workingHoursRepository.findAll()
                .stream()
                .sorted(Comparator.comparing(WorkingHours::getDayOfWeek))
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public WorkingHoursResponse upsert(UpsertWorkingHoursRequest request) {
        validateTimes(request);

        WorkingHours workingHours = workingHoursRepository.findByDayOfWeek(request.dayOfWeek())
                .orElseGet(() -> new WorkingHours(
                        request.dayOfWeek(),
                        request.openTime(),
                        request.closeTime()
                ));

        workingHours.update(
                request.openTime(),
                request.closeTime(),
                request.active()
        );

        return toResponse(workingHoursRepository.save(workingHours));
    }

    private void validateTimes(UpsertWorkingHoursRequest request) {
        if (!request.openTime().isBefore(request.closeTime())) {
            throw new BadRequestException("Open time must be before close time");
        }
    }

    private WorkingHoursResponse toResponse(WorkingHours workingHours) {
        return new WorkingHoursResponse(
                workingHours.getId(),
                workingHours.getDayOfWeek(),
                workingHours.getOpenTime(),
                workingHours.getCloseTime(),
                workingHours.isActive()
        );
    }
}