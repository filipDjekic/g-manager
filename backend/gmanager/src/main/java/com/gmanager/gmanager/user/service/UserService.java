package com.gmanager.gmanager.user.service;

import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.common.exception.ForbiddenException;
import com.gmanager.gmanager.common.exception.NotFoundException;
import com.gmanager.gmanager.security.user.SecurityUser;
import com.gmanager.gmanager.user.domain.User;
import com.gmanager.gmanager.user.domain.UserRole;
import com.gmanager.gmanager.user.dto.*;
import com.gmanager.gmanager.user.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public UserResponse getMe(SecurityUser currentUser) {
        return toResponse(currentUser.getUser());
    }

    @Transactional
    public UserResponse updateMe(SecurityUser currentUser, UpdateProfileRequest request) {
        User user = getUserOrThrow(currentUser.getId());
        user.updateProfile(request.name().trim());
        return toResponse(user);
    }

    @Transactional(readOnly = true)
    public Page<UserResponse> getUsers(SecurityUser currentUser, Pageable pageable) {
        requireOwnerOrAdmin(currentUser);

        return userRepository.findAll(pageable)
                .map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(SecurityUser currentUser, Long id) {
        User target = getUserOrThrow(id);
        ensureCanManageTarget(currentUser, target);

        return toResponse(target);
    }

    @Transactional
    public UserResponse createUser(SecurityUser currentUser, CreateUserRequest request) {
        requireOwnerOrAdmin(currentUser);
        ensureCanCreateRole(currentUser, request.role());

        String email = normalizeEmail(request.email());

        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email is already in use");
        }

        User user = new User(
                request.name().trim(),
                email,
                passwordEncoder.encode(request.password()),
                request.role()
        );

        return toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUser(SecurityUser currentUser, Long id, UpdateUserRequest request) {
        User target = getUserOrThrow(id);

        ensureCanManageTarget(currentUser, target);
        ensureCanCreateRole(currentUser, request.role());

        target.updateManagedData(request.name().trim(), request.role());

        return toResponse(target);
    }

    @Transactional
    public UserResponse updateRole(SecurityUser currentUser, Long id, UpdateUserRoleRequest request) {
        User target = getUserOrThrow(id);

        ensureCanManageTarget(currentUser, target);
        ensureCanCreateRole(currentUser, request.role());

        target.changeRole(request.role());

        return toResponse(target);
    }

    @Transactional
    public UserResponse updateStatus(SecurityUser currentUser, Long id, UpdateUserStatusRequest request) {
        User target = getUserOrThrow(id);

        ensureCanManageTarget(currentUser, target);

        if (currentUser.getId().equals(target.getId()) && Boolean.FALSE.equals(request.active())) {
            throw new BadRequestException("You cannot deactivate your own account");
        }

        target.setActive(request.active());

        return toResponse(target);
    }

    @Transactional
    public void deactivateUser(SecurityUser currentUser, Long id) {
        User target = getUserOrThrow(id);

        ensureCanManageTarget(currentUser, target);

        if (currentUser.getId().equals(target.getId())) {
            throw new BadRequestException("You cannot deactivate your own account");
        }

        target.setActive(false);
    }

    private User getUserOrThrow(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    private void requireOwnerOrAdmin(SecurityUser currentUser) {
        UserRole role = currentUser.getUser().getRole();

        if (role != UserRole.OWNER && role != UserRole.ADMIN) {
            throw new ForbiddenException("Access denied");
        }
    }

    private void ensureCanManageTarget(SecurityUser currentUser, User target) {
        UserRole actorRole = currentUser.getUser().getRole();

        if (actorRole == UserRole.OWNER) {
            return;
        }

        if (actorRole == UserRole.ADMIN && target.getRole() == UserRole.EMPLOYEE) {
            return;
        }

        if (currentUser.getId().equals(target.getId())) {
            return;
        }

        throw new ForbiddenException("Access denied");
    }

    private void ensureCanCreateRole(SecurityUser currentUser, UserRole targetRole) {
        UserRole actorRole = currentUser.getUser().getRole();

        if (actorRole == UserRole.OWNER) {
            if (targetRole == UserRole.OWNER) {
                throw new BadRequestException("Cannot create or assign OWNER role");
            }
            return;
        }

        if (actorRole == UserRole.ADMIN && targetRole == UserRole.EMPLOYEE) {
            return;
        }

        throw new ForbiddenException("Access denied");
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.isActive(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}