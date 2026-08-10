package com.game_manager.gm.feature;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/features")
public class FeatureFlagController {
    private final FeatureFlagService service;

    public FeatureFlagController(FeatureFlagService service) {
        this.service = service;
    }

    @GetMapping("/bootstrap")
    List<FeatureFlagResponse> bootstrap() {
        return service.bootstrap();
    }

    @GetMapping
    List<FeatureFlagResponse> definitions() {
        return service.definitions();
    }

    @PatchMapping("/{flag}")
    ResponseEntity<FeatureFlagResponse> update(@PathVariable FeatureFlag flag,
            @Valid @RequestBody UpdateFeatureFlagRequest request) {
        return ResponseEntity.ok(service.update(flag, request));
    }
}
