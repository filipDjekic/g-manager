package com.game_manager.gm.availability;

import com.game_manager.gm.availability.dto.AvailabilityQuery;
import com.game_manager.gm.availability.dto.AvailabilityResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/availability")
@RequiredArgsConstructor
public class AvailabilityController {
    private final AvailabilityService service;

    @GetMapping
    public AvailabilityResponse find(@Valid @ModelAttribute AvailabilityQuery query) {
        return service.find(query);
    }
}
