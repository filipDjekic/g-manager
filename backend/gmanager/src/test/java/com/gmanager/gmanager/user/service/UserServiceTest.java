package com.gmanager.gmanager.user.service;

import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.common.exception.ForbiddenException;
import com.gmanager.gmanager.security.user.SecurityUser;
import com.gmanager.gmanager.user.domain.User;
import com.gmanager.gmanager.user.domain.UserRole;
import com.gmanager.gmanager.user.dto.CreateUserRequest;
import com.gmanager.gmanager.user.dto.UpdateUserStatusRequest;
import com.gmanager.gmanager.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class UserServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final UserService userService = new UserService(userRepository, passwordEncoder);

    @Test
    void ownerShouldCreateAdmin() {
        User owner = new User("Owner", "owner@gmanager.com", "hash", UserRole.OWNER);

        CreateUserRequest request = new CreateUserRequest(
                "Admin",
                "admin@gmanager.com",
                "Password123",
                UserRole.ADMIN
        );

        when(userRepository.existsByEmail("admin@gmanager.com")).thenReturn(false);
        when(passwordEncoder.encode("Password123")).thenReturn("hash");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        userService.createUser(new SecurityUser(owner), request);

        verify(userRepository).save(any(User.class));
    }

    @Test
    void adminShouldNotCreateAdmin() {
        User admin = new User("Admin", "admin@gmanager.com", "hash", UserRole.ADMIN);

        CreateUserRequest request = new CreateUserRequest(
                "Admin Two",
                "admin2@gmanager.com",
                "Password123",
                UserRole.ADMIN
        );

        assertThatThrownBy(() -> userService.createUser(new SecurityUser(admin), request))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void ownerShouldNotCreateOwner() {
        User owner = new User("Owner", "owner@gmanager.com", "hash", UserRole.OWNER);

        CreateUserRequest request = new CreateUserRequest(
                "Owner Two",
                "owner2@gmanager.com",
                "Password123",
                UserRole.OWNER
        );

        assertThatThrownBy(() -> userService.createUser(new SecurityUser(owner), request))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void userCannotDeactivateSelf() {
        User owner = new User("Owner", "owner@gmanager.com", "hash", UserRole.OWNER);

        when(userRepository.findById(null)).thenReturn(Optional.of(owner));

        assertThatThrownBy(() ->
                userService.updateStatus(
                        new SecurityUser(owner),
                        null,
                        new UpdateUserStatusRequest(false)
                )
        ).isInstanceOf(BadRequestException.class);
    }
}