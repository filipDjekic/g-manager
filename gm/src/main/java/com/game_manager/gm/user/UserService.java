package com.game_manager.gm.user;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.config.PageRequestFactory;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.SessionRevocationPort;
import com.game_manager.gm.media.FileStorageService;
import com.game_manager.gm.user.dto.ChangePasswordRequest;
import com.game_manager.gm.user.dto.CreateUserRequest;
import com.game_manager.gm.user.dto.UpdateProfileRequest;
import com.game_manager.gm.user.dto.UserResponse;
import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.common.dto.DeletionReasonRequest;
import com.game_manager.gm.events.DomainEventType;
import com.game_manager.gm.events.OutboxWriter;
import java.time.Instant;
import java.util.Map;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class UserService {
    private static final Set<String> ALLOWED_SORTS =
            Set.of("name", "email", "role", "active", "createdAt");

    private final UserRepository userRepository;
    private final CurrentUserProvider currentUserProvider;
    private final PasswordEncoder passwordEncoder;
    private final FileStorageService fileStorageService;
    private final SessionRevocationPort refreshTokenRevocationService;
    private final PageRequestFactory pageRequestFactory;
    private final UserAuthorizationPolicy authorizationPolicy;
    private final AuditWriter auditWriter;
    private final OutboxWriter outboxWriter;

    @Transactional(readOnly = true)
    public java.util.List<EmployeeAnalyticsRow> activeEmployeesForAnalytics() {
        return userRepository.activeEmployeesForAnalytics();
    }

    @Transactional(readOnly = true)
    public java.util.Optional<String> activeEmail(UUID id) {
        return userRepository.findById(id).filter(User::isActive).map(User::getEmail);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    public PageResponse<CustomerReference> customerPage(
            String search, Boolean active, int page, int size) {
        currentUserProvider.requireCurrentUser();
        Specification<User> specification = UserSpecifications.notDeleted()
                .and(UserSpecifications.hasRole(Role.CUSTOMER))
                .and(UserSpecifications.isActive(active));
        if (search != null && !search.isBlank()) {
            specification = specification.and(UserSpecifications.matchesSearch(search));
        }
        return PageResponse.from(userRepository.findAll(specification,
                pageRequestFactory.create(page, size, "createdAt", "DESC", ALLOWED_SORTS))
                .map(UserService::customerReference));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('CUSTOMER_READ')")
    public CustomerReference customerReference(UUID id) {
        currentUserProvider.requireCurrentUser();
        User user = userRepository.findById(id)
                .filter(value -> value.getRole() == Role.CUSTOMER)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Customer not found"));
        return customerReference(user);
    }

    private static CustomerReference customerReference(User user) {
        return new CustomerReference(user.getId(), user.getName(), user.getEmail(), user.isActive(), user.getCreatedAt());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('PROFILE_READ')")
    public UserResponse getCurrentUser() {
        return UserResponse.from(requireCurrentUser());
    }

    @Transactional
    @PreAuthorize("hasAuthority('PROFILE_UPDATE')")
    public UserResponse updateCurrentUser(UpdateProfileRequest request) {
        User user = requireCurrentUser();
        String previousName = user.getName();
        user.setName(request.name().trim());
        User saved = userRepository.save(user);
        auditWriter.write("USER_PROFILE_UPDATED", "USER", saved.getId(),
                Map.of("name", previousName), Map.of("name", saved.getName()), null, visibility(saved));
        outboxWriter.write(DomainEventType.USER_PROFILE_UPDATED, "USER", saved.getId(), Map.of());
        return UserResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('PROFILE_UPDATE')")
    public void changePassword(ChangePasswordRequest request) {
        User user = requireCurrentUser();
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ApplicationException(
                    HttpStatus.BAD_REQUEST, "New password must differ from the current password");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        refreshTokenRevocationService.revokeAllSessions(user.getId());
        auditWriter.write("USER_PASSWORD_CHANGED", "USER", user.getId(),
                Map.of("password", "[REDACTED]"), Map.of("password", "[REDACTED]"),
                "All refresh sessions revoked", visibility(user));
        outboxWriter.write(DomainEventType.USER_PASSWORD_CHANGED, "USER", user.getId(), Map.of());
    }

    @Transactional
    @PreAuthorize("hasAuthority('PROFILE_UPDATE')")
    public UserResponse uploadAvatar(MultipartFile avatar) {
        User user = requireCurrentUser();
        boolean hadAvatar = user.getAvatarUrl() != null;
        user.setAvatarUrl(fileStorageService.storeAvatar(avatar));
        User saved = userRepository.save(user);
        auditWriter.write("USER_AVATAR_UPDATED", "USER", saved.getId(),
                Map.of("avatarPresent", hadAvatar), Map.of("avatarPresent", true), null, visibility(saved));
        return UserResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('USER_CREATE')")
    public UserResponse createUser(CreateUserRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        requireManagementRole(actor.role());
        authorizationPolicy.requireCreatableRole(actor, request.role());
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Email is already in use");
        }

        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(request.role());
        user.setActive(true);
        User saved = userRepository.save(user);
        auditWriter.write("USER_CREATED", "USER", saved.getId(), null, userAuditData(saved),
                null, visibility(saved));
        outboxWriter.write(DomainEventType.USER_CREATED, "USER", saved.getId(),
                Map.of("active", saved.isActive()));
        return UserResponse.from(saved);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('USER_LIST')")
    public PageResponse<UserResponse> listUsers(
            Role role, Boolean active, int page, int size, String sort, String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        requireManagementRole(actor.role());
        Specification<User> specification = UserSpecifications.notDeleted();
        if (actor.role() == Role.ADMIN) {
            specification = specification.and(UserSpecifications.adminVisibleOnly(true));
        }
        if (role != null) {
            specification = specification.and(UserSpecifications.hasRole(role));
        }
        if (active != null) {
            specification = specification.and(UserSpecifications.isActive(active));
        }
        Page<UserResponse> result = userRepository
                .findAll(specification,
                        pageRequestFactory.create(page, size, sort, direction, ALLOWED_SORTS))
                .map(UserResponse::from);
        return PageResponse.from(result);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('EMPLOYEE_LIST')")
    public PageResponse<UserResponse> listActiveEmployees(int page, int size) {
        currentUserProvider.requireCurrentUser();
        Specification<User> specification = UserSpecifications.hasRole(Role.EMPLOYEE)
                .and(UserSpecifications.isActive(true)).and(UserSpecifications.notDeleted());
        return PageResponse.from(userRepository
                .findAll(specification,
                        pageRequestFactory.create(page, size, Sort.by("name").ascending()))
                .map(UserResponse::from));
    }

    @Transactional
    @PreAuthorize("hasAuthority('USER_DEACTIVATE')")
    public void deactivateUser(UUID targetId) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        requireManagementRole(actor.role());
        User target = userRepository.findById(targetId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "User not found"));
        authorizationPolicy.requireDeactivation(actor, target);
        if (!target.isActive()) {
            return;
        }
        target.setActive(false);
        userRepository.save(target);
        refreshTokenRevocationService.revokeAllSessions(targetId);
        auditWriter.write("USER_DEACTIVATED", "USER", targetId,
                Map.of("active", true), Map.of("active", false), null, visibility(target));
        outboxWriter.write(DomainEventType.USER_DEACTIVATED, "USER", targetId,
                Map.of("active", false));
    }

    @Transactional
    @PreAuthorize("hasAuthority('USER_DELETE')")
    public void deleteUser(UUID targetId, DeletionReasonRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        User target = userRepository.findById(targetId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "User not found"));
        authorizationPolicy.requireDeactivation(actor, target);
        Map<String, Object> before = userAuditData(target);
        target.softDelete(actor.id(), request.reason(), Instant.now());
        userRepository.save(target);
        refreshTokenRevocationService.revokeAllSessions(targetId);
        auditWriter.write("USER_DELETED", "USER", targetId, before,
                Map.of("deleted", true), request.reason(), visibility(target));
        outboxWriter.write(DomainEventType.USER_DELETED, "USER", targetId,
                Map.of("deleted", true));
    }

    @Transactional
    @PreAuthorize("hasAuthority('USER_RESTORE')")
    public UserResponse restoreUser(UUID targetId) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        User target = userRepository.findDeletedById(targetId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Deleted user not found"));
        authorizationPolicy.requireDeactivation(actor, target);
        if (userRepository.existsByEmailIgnoreCaseAndIdNotAndDeletedAtIsNull(target.getEmail(), targetId)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Email is already used by an active account");
        }
        String reason = target.getDeletionReason();
        target.restore();
        User saved = userRepository.save(target);
        auditWriter.write("USER_RESTORED", "USER", targetId, Map.of("deleted", true),
                userAuditData(saved), reason, visibility(saved));
        outboxWriter.write(DomainEventType.USER_RESTORED, "USER", targetId,
                Map.of("active", saved.isActive()));
        return UserResponse.from(saved);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('USER_RESTORE')")
    public PageResponse<UserResponse> listDeletedUsers(int page, int size) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        Specification<User> spec = UserSpecifications.deleted();
        if (actor.role() == Role.ADMIN) spec = spec.and(UserSpecifications.adminVisibleOnly(true));
        return PageResponse.from(userRepository.findAll(spec,
                pageRequestFactory.create(page, size, Sort.by("deletedAt").descending()))
                .map(UserResponse::from));
    }

    private User requireCurrentUser() {
        AuthenticatedUser authenticated = currentUserProvider.requireCurrentUser();
        User user = userRepository.findById(authenticated.id())
                .orElseThrow(() -> new ApplicationException(HttpStatus.UNAUTHORIZED, "User is not active"));
        if (!user.isActive()) {
            throw new ApplicationException(HttpStatus.UNAUTHORIZED, "User is not active");
        }
        return user;
    }

    private static void requireManagementRole(Role role) {
        if (role != Role.OWNER && role != Role.ADMIN) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "User management is not permitted");
        }
    }

    private static Map<String, Object> userAuditData(User user) {
        return Map.of("name", user.getName(), "email", user.getEmail(),
                "role", user.getRole().name(), "active", user.isActive());
    }

    private static AuditVisibility visibility(User user) {
        return user.getRole() == Role.OWNER ? AuditVisibility.OWNER_ONLY : AuditVisibility.MANAGEMENT;
    }

}
