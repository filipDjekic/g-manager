package com.game_manager.gm.user;

import com.game_manager.gm.auth.RefreshTokenRevocationService;
import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.media.FileStorageService;
import com.game_manager.gm.security.AuthenticatedUser;
import com.game_manager.gm.security.CurrentUserProvider;
import com.game_manager.gm.user.dto.ChangePasswordRequest;
import com.game_manager.gm.user.dto.CreateUserRequest;
import com.game_manager.gm.user.dto.UpdateProfileRequest;
import com.game_manager.gm.user.dto.UserResponse;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
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
    private final RefreshTokenRevocationService refreshTokenRevocationService;

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser() {
        return UserResponse.from(requireCurrentUser());
    }

    @Transactional
    public UserResponse updateCurrentUser(UpdateProfileRequest request) {
        User user = requireCurrentUser();
        user.setName(request.name().trim());
        return UserResponse.from(userRepository.save(user));
    }

    @Transactional
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
    }

    @Transactional
    public UserResponse uploadAvatar(MultipartFile avatar) {
        User user = requireCurrentUser();
        user.setAvatarUrl(fileStorageService.storeAvatar(avatar));
        return UserResponse.from(userRepository.save(user));
    }

    @Transactional
    public UserResponse createUser(CreateUserRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        requireManagementRole(actor.role());
        validateCreatableRole(actor.role(), request.role());
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
        return UserResponse.from(userRepository.save(user));
    }

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> listUsers(
            Role role, Boolean active, int page, int size, String sort, String direction) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        requireManagementRole(actor.role());
        if (page < 0) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Page must not be negative");
        }
        if (size < 1) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Size must be positive");
        }
        if (!ALLOWED_SORTS.contains(sort)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unsupported sort field");
        }

        Sort.Direction sortDirection;
        try {
            sortDirection = Sort.Direction.fromString(direction);
        } catch (IllegalArgumentException exception) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unsupported sort direction");
        }

        Specification<User> specification = (root, query, builder) -> builder.conjunction();
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
                .findAll(specification, PageRequest.of(
                        page, Math.min(size, 100), Sort.by(sortDirection, sort)))
                .map(UserResponse::from);
        return PageResponse.from(result);
    }

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> listActiveEmployees(int page, int size) {
        currentUserProvider.requireCurrentUser();
        if (page < 0 || size < 1) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Pagination is not valid");
        }
        Specification<User> specification = UserSpecifications.hasRole(Role.EMPLOYEE)
                .and(UserSpecifications.isActive(true));
        return PageResponse.from(userRepository
                .findAll(specification, PageRequest.of(
                        page, Math.min(size, 100), Sort.by("name").ascending()))
                .map(UserResponse::from));
    }

    @Transactional
    public void deactivateUser(UUID targetId) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        requireManagementRole(actor.role());
        if (actor.id().equals(targetId)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "You cannot deactivate your own account");
        }
        User target = userRepository.findById(targetId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "User not found"));
        validateDeactivation(actor.role(), target.getRole());
        if (!target.isActive()) {
            return;
        }
        target.setActive(false);
        userRepository.save(target);
        refreshTokenRevocationService.revokeAllSessions(targetId);
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

    private static void validateCreatableRole(Role actorRole, Role targetRole) {
        boolean permitted = actorRole == Role.OWNER
                ? targetRole == Role.ADMIN || targetRole == Role.EMPLOYEE
                : targetRole == Role.EMPLOYEE;
        if (!permitted) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "The requested role cannot be created");
        }
    }

    private static void validateDeactivation(Role actorRole, Role targetRole) {
        boolean permitted = actorRole == Role.OWNER
                ? targetRole != Role.OWNER
                : targetRole == Role.EMPLOYEE;
        if (!permitted) {
            throw new ApplicationException(HttpStatus.FORBIDDEN, "The requested user cannot be deactivated");
        }
    }
}
