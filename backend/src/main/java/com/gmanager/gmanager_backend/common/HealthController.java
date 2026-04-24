package com.gmanager.gmanager_backend.common;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    @GetMapping("/api/health")
    public String health() { return "OK"; }

    @GetMapping("/api/me/ping")
    public String protectedPing() { return "authenticated-ok"; }
}
