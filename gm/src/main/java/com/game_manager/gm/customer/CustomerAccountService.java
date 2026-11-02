package com.game_manager.gm.customer;

import com.game_manager.gm.audit.AuditVisibility;
import com.game_manager.gm.audit.AuditWriter;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.common.security.SecurityEventPort;
import com.game_manager.gm.common.security.SessionRevocationPort;
import com.game_manager.gm.customer.dto.CreateCustomerRequest;
import com.game_manager.gm.customer.dto.CustomerOnboardingResponse;
import com.game_manager.gm.customer.dto.UpdateCustomerRequest;
import com.game_manager.gm.events.DomainEventType;
import com.game_manager.gm.events.OutboxWriter;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.user.dto.UserResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CustomerAccountService {
    private static final String INVALID_ACTIVATION = "Activation code is invalid or expired";
    private final UserRepository users;
    private final CustomerActivationTokenRepository activationTokens;
    private final CurrentUserProvider currentUser;
    private final PasswordEncoder passwordEncoder;
    private final SessionRevocationPort sessionRevocation;
    private final AuditWriter audit;
    private final OutboxWriter outbox;
    private final CustomerActivationCodeGenerator activationCodes;
    private final CustomerActivationHash activationHash;
    private final SecurityEventPort securityEvents;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    @PreAuthorize("hasAuthority('CUSTOMER_CREATE')")
    public CustomerOnboardingResponse create(CreateCustomerRequest request) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        String email = normalizeEmail(request.email());
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Email is already in use");
        }
        User customer = new User();
        customer.setName(request.name().trim());
        customer.setEmail(email);
        customer.setPasswordHash(passwordEncoder.encode(newSecret()));
        customer.setRole(Role.CUSTOMER);
        customer.setActive(true);
        customer.setMustChangePassword(true);
        customer = users.save(customer);

        String secret = activationCodes.generate();
        Instant expiresAt = clock.instant().plus(Duration.ofHours(1));
        CustomerActivationToken token = new CustomerActivationToken();
        token.setUserId(customer.getId());
        token.setTokenHash(activationHash.hash("code", secret));
        token.setExpiresAt(expiresAt);
        token.setCreatedBy(actor.id());
        activationTokens.save(token);
        audit.write("CUSTOMER_CREATED", "USER", customer.getId(), null,
                auditData(customer), "Staff onboarding", AuditVisibility.MANAGEMENT);
        audit.write("CUSTOMER_ACTIVATION_ISSUED", "USER", customer.getId(), null,
                Map.of("expiresAt", expiresAt.toString()), null, AuditVisibility.MANAGEMENT);
        outbox.write(DomainEventType.USER_CREATED, "USER", customer.getId(),
                Map.of("role", Role.CUSTOMER.name(), "activationRequired", true));
        return new CustomerOnboardingResponse(customer.getId(), customer.getName(), customer.getEmail(),
                customer.isActive(), customer.getVersion(), secret, expiresAt);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CUSTOMER_UPDATE_LIMITED')")
    public UserResponse update(UUID id, UpdateCustomerRequest request) {
        currentUser.requireCurrentUser();
        User customer = requireCustomer(id);
        if (!customer.getVersion().equals(request.version())) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Customer was changed by another user");
        }
        String email = normalizeEmail(request.email());
        if (users.existsByEmailIgnoreCaseAndIdNotAndDeletedAtIsNull(email, id)) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Email is already in use");
        }
        Map<String, Object> before = auditData(customer);
        customer.setName(request.name().trim());
        customer.setEmail(email);
        User saved = users.save(customer);
        audit.write("CUSTOMER_UPDATED", "USER", id, before, auditData(saved),
                null, AuditVisibility.MANAGEMENT);
        return UserResponse.from(saved);
    }

    @Transactional
    @PreAuthorize("hasAuthority('CUSTOMER_DEACTIVATE')")
    public void deactivate(UUID id) {
        currentUser.requireCurrentUser();
        User customer = requireCustomer(id);
        if (!customer.isActive()) return;
        customer.setActive(false);
        users.save(customer);
        Instant now = clock.instant();
        activationTokens.consumeActiveForUser(id, now);
        sessionRevocation.revokeAllSessions(id);
        audit.write("CUSTOMER_DEACTIVATED", "USER", id,
                Map.of("active", true), Map.of("active", false), null,
                AuditVisibility.MANAGEMENT);
        outbox.write(DomainEventType.USER_DEACTIVATED, "USER", id,
                Map.of("role", Role.CUSTOMER.name()));
    }

    @Transactional
    public void activate(String email, String activationSecret, String password, String ipHash) {
        // Validate the secret without a Bean Validation rejected value: Spring's DEBUG
        // exception logs can otherwise include the submitted code despite DTO redaction.
        if (activationSecret == null || !activationSecret.matches("[A-Z0-9]{4}")) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, INVALID_ACTIVATION);
        }
        // Match deactivate/update lock order: user first, then activation token.
        User customer = users.findByEmailForUpdate(normalizeEmail(email))
                .filter(value -> value.getRole() == Role.CUSTOMER && value.isActive()
                        && value.isMustChangePassword())
                .orElseThrow(() -> new ApplicationException(HttpStatus.BAD_REQUEST, INVALID_ACTIVATION));
        CustomerActivationToken token = activationTokens.findByHashForUpdate(
                        activationHash.hash("code", activationSecret))
                .filter(value -> value.getUserId().equals(customer.getId()))
                .filter(value -> value.getConsumedAt() == null)
                .filter(value -> value.getExpiresAt().isAfter(clock.instant()))
                .orElseThrow(() -> new ApplicationException(HttpStatus.BAD_REQUEST, INVALID_ACTIVATION));
        String passwordHash = passwordEncoder.encode(password);
        Instant now = clock.instant();
        // Password hashing or waiting for locks must not extend the one-hour deadline.
        if (!token.getExpiresAt().isAfter(now)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, INVALID_ACTIVATION);
        }
        customer.setPasswordHash(passwordHash);
        customer.setMustChangePassword(false);
        users.save(customer);
        activationTokens.consumeActiveForUser(customer.getId(), now);
        securityEvents.recordActivationSuccess(customer.getId(), ipHash);
        outbox.write(DomainEventType.USER_PASSWORD_CHANGED, "USER", customer.getId(),
                Map.of("activation", true));
    }

    private User requireCustomer(UUID id) {
        return users.findByIdForUpdate(id)
                .filter(value -> value.getRole() == Role.CUSTOMER)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Customer not found"));
    }

    private String newSecret() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static Map<String, Object> auditData(User user) {
        return Map.of("name", user.getName(), "email", user.getEmail(),
                "role", user.getRole().name(), "active", user.isActive());
    }
}
