package com.gmanager.gmanager_backend.user;

import com.gmanager.gmanager_backend.exception.BadRequestException;
import com.gmanager.gmanager_backend.exception.UnauthorizedException;
import com.gmanager.gmanager_backend.organization.Organization;
import com.gmanager.gmanager_backend.user.dto.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public UserResponse me(Authentication authentication) {
        return toResponse(currentUser(authentication));
    }

    @Transactional(readOnly = true)
    public List<UserResponse> employees(Authentication authentication) {
        User current = currentUser(authentication);
        Organization organization = requireOrganization(current);
        return userRepository.findAllByOrganizationIdAndRoleIn(organization.getId(), List.of(Role.OWNER, Role.ADMIN, Role.EMPLOYEE))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public UserResponse create(CreateUserRequest request, Authentication authentication) {
        User current = currentUser(authentication);
        Organization organization = requireOrganization(current);
        Role role = requireStaffRole(request.role());
        String email = normalizeEmail(request.email());

        if (userRepository.existsByEmail(email)) throw new BadRequestException("Email is already registered");

        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(role);
        user.setActive(true);
        user.setOrganization(organization);
        return toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse update(Long id, UpdateUserRequest request, Authentication authentication) {
        User current = currentUser(authentication);
        User user = findTenantUser(id, current);
        if (user.getRole() == Role.OWNER) throw new BadRequestException("Owner account cannot be edited from employees page");

        Role role = requireStaffRole(request.role());
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailAndIdNot(email, id)) throw new BadRequestException("Email is already registered");

        user.setName(request.name().trim());
        user.setEmail(email);
        user.setRole(role);
        return toResponse(user);
    }

    @Transactional
    public UserResponse setActive(Long id, boolean active, Authentication authentication) {
        User current = currentUser(authentication);
        if (current.getId().equals(id) && !active) throw new BadRequestException("You cannot deactivate your own account");

        User user = findTenantUser(id, current);
        if (user.getRole() == Role.OWNER) throw new BadRequestException("Owner account cannot be deactivated from employees page");

        user.setActive(active);
        return toResponse(user);
    }

    @Transactional
    public void changePassword(Long id, ChangePasswordRequest request, Authentication authentication) {
        User current = currentUser(authentication);
        boolean self = current.getId().equals(id);
        if (!self && current.getRole() != Role.OWNER && current.getRole() != Role.ADMIN) throw new UnauthorizedException("Not allowed");
        if (self && (request.currentPassword() == null || !passwordEncoder.matches(request.currentPassword(), current.getPasswordHash()))) {
            throw new BadRequestException("Current password is not valid");
        }
        User user = self ? current : findTenantUser(id, current);
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
    }

    private Role requireStaffRole(Role role) {
        if (role != Role.ADMIN && role != Role.EMPLOYEE) {
            throw new BadRequestException("User role must be ADMIN or EMPLOYEE");
        }
        return role;
    }

    private User findTenantUser(Long id, User current) {
        User user = find(id);
        Organization organization = requireOrganization(current);
        if (user.getOrganization() == null || !user.getOrganization().getId().equals(organization.getId())) {
            throw new UnauthorizedException("Access denied");
        }
        return user;
    }

    private Organization requireOrganization(User user) {
        if (user.getOrganization() == null) throw new BadRequestException("User is not assigned to an organization");
        return user.getOrganization();
    }

    private User find(Long id) {
        return userRepository.findById(id).orElseThrow(() -> new BadRequestException("User not found"));
    }

    private User currentUser(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName()).orElseThrow(() -> new UnauthorizedException("User not found"));
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }

    private UserResponse toResponse(User u) {
        Long orgId = u.getOrganization() == null ? null : u.getOrganization().getId();
        String orgName = u.getOrganization() == null ? null : u.getOrganization().getName();
        return new UserResponse(u.getId(), u.getName(), u.getEmail(), u.getRole(), u.isActive(), orgId, orgName, u.getCreatedAt(), u.getUpdatedAt());
    }
}
