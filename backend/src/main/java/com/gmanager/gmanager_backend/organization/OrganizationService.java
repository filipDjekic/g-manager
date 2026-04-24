package com.gmanager.gmanager_backend.organization;

import com.gmanager.gmanager_backend.exception.BadRequestException;
import com.gmanager.gmanager_backend.exception.UnauthorizedException;
import com.gmanager.gmanager_backend.organization.dto.OrganizationRequest;
import com.gmanager.gmanager_backend.organization.dto.OrganizationResponse;
import com.gmanager.gmanager_backend.user.Role;
import com.gmanager.gmanager_backend.user.User;
import com.gmanager.gmanager_backend.user.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrganizationService {
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;

    public OrganizationService(OrganizationRepository organizationRepository, UserRepository userRepository) {
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public OrganizationResponse current(Authentication authentication) {
        User current = currentUser(authentication);
        Organization organization = currentOrganization(current);
        return toResponse(organization);
    }

    @Transactional
    public OrganizationResponse create(OrganizationRequest request, Authentication authentication) {
        User current = currentUser(authentication);
        if (current.getRole() != Role.OWNER) throw new UnauthorizedException("Only owner can create an organization");
        if (current.getOrganization() != null || organizationRepository.existsByOwner(current)) {
            throw new BadRequestException("Owner already has an organization");
        }

        Organization organization = new Organization();
        apply(organization, request);
        organization.setOwner(current);
        Organization saved = organizationRepository.save(organization);

        current.setOrganization(saved);
        return toResponse(saved);
    }

    @Transactional
    public OrganizationResponse update(OrganizationRequest request, Authentication authentication) {
        User current = currentUser(authentication);
        if (current.getRole() != Role.OWNER) throw new UnauthorizedException("Only owner can update an organization");
        Organization organization = currentOrganization(current);
        if (!organization.getOwner().getId().equals(current.getId())) throw new UnauthorizedException("Access denied");
        apply(organization, request);
        return toResponse(organization);
    }

    private Organization currentOrganization(User user) {
        if (user.getOrganization() == null) throw new BadRequestException("User is not assigned to an organization");
        return organizationRepository.findById(user.getOrganization().getId())
                .orElseThrow(() -> new BadRequestException("Organization not found"));
    }

    private User currentUser(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName()).orElseThrow(() -> new UnauthorizedException("User not found"));
    }

    private void apply(Organization organization, OrganizationRequest request) {
        organization.setName(request.name().trim());
        organization.setAddress(request.address().trim());
        organization.setPhone(request.phone().trim());
    }

    private OrganizationResponse toResponse(Organization organization) {
        User owner = organization.getOwner();
        return new OrganizationResponse(
                organization.getId(),
                organization.getName(),
                organization.getAddress(),
                organization.getPhone(),
                owner.getId(),
                owner.getName(),
                organization.getCreatedAt(),
                organization.getUpdatedAt()
        );
    }
}
