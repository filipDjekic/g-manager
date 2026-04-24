package com.gmanager.gmanager_backend.organization;

import com.gmanager.gmanager_backend.organization.dto.OrganizationRequest;
import com.gmanager.gmanager_backend.organization.dto.OrganizationResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/organizations")
public class OrganizationController {
    private final OrganizationService organizationService;

    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN','EMPLOYEE')")
    public OrganizationResponse current(Authentication authentication) {
        return organizationService.current(authentication);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('OWNER')")
    public OrganizationResponse create(@Valid @RequestBody OrganizationRequest request, Authentication authentication) {
        return organizationService.create(request, authentication);
    }

    @PutMapping("/me")
    @PreAuthorize("hasRole('OWNER')")
    public OrganizationResponse update(@Valid @RequestBody OrganizationRequest request, Authentication authentication) {
        return organizationService.update(request, authentication);
    }
}
