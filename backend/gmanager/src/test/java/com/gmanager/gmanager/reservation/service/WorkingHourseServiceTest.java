package com.gmanager.gmanager.reservation.service;

import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.reservation.dto.UpsertWorkingHoursRequest;
import com.gmanager.gmanager.reservation.repository.WorkingHoursRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class WorkingHoursServiceTest {

    private final WorkingHoursRepository workingHoursRepository = mock(WorkingHoursRepository.class);
    private final WorkingHoursService workingHoursService = new WorkingHoursService(workingHoursRepository);

    @Test
    void shouldRejectInvalidTimeRange() {
        UpsertWorkingHoursRequest request = new UpsertWorkingHoursRequest(
                1,
                LocalTime.of(17, 0),
                LocalTime.of(9, 0),
                true
        );

        assertThatThrownBy(() -> workingHoursService.upsert(request))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("Open time must be before close time");
    }

    @Test
    void shouldCreateWorkingHours() {
        UpsertWorkingHoursRequest request = new UpsertWorkingHoursRequest(
                1,
                LocalTime.of(9, 0),
                LocalTime.of(17, 0),
                true
        );

        when(workingHoursRepository.findByDayOfWeek(1)).thenReturn(Optional.empty());
        when(workingHoursRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        workingHoursService.upsert(request);

        verify(workingHoursRepository).save(any());
    }
}