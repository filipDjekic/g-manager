package com.gmanager.gmanager.auth.service;

import com.gmanager.gmanager.auth.dto.AuthResponse;
import com.gmanager.gmanager.auth.dto.LoginRequest;
import com.gmanager.gmanager.auth.dto.RegisterRequest;
import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.security.jwt.JwtService;
import com.gmanager.gmanager.user.domain.User;
import com.gmanager.gmanager.user.domain.UserRole;
import com.gmanager.gmanager.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AuthServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final AuthenticationManager authenticationManager = mock(AuthenticationManager.class);
    private final JwtService jwtService = mock(JwtService.class);

    private final AuthService authService = new AuthService(
            userRepository,
            passwordEncoder,
            authenticationManager,
            jwtService,
            3600000
    );

    @Test
    void shouldRegisterFirstUserAsOwner() {
        RegisterRequest request = new RegisterRequest(
                "Owner",
                "OWNER@GMANAGER.COM",
                "Password123"
        );

        when(userRepository.existsByEmail("owner@gmanager.com")).thenReturn(false);
        when(userRepository.count()).thenReturn(0L);
        when(passwordEncoder.encode("Password123")).thenReturn("hashed");

        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.generateToken(any())).thenReturn("token");

        AuthResponse response = authService.register(request);

        assertThat(response.token()).isEqualTo("token");
        assertThat(response.user().email()).isEqualTo("owner@gmanager.com");
        assertThat(response.user().role()).isEqualTo(UserRole.OWNER);

        verify(userRepository).save(any(User.class));
    }

    @Test
    void shouldRegisterNextUsersAsCustomer() {
        RegisterRequest request = new RegisterRequest(
                "Customer",
                "customer@gmanager.com",
                "Password123"
        );

        when(userRepository.existsByEmail("customer@gmanager.com")).thenReturn(false);
        when(userRepository.count()).thenReturn(1L);
        when(passwordEncoder.encode("Password123")).thenReturn("hashed");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.generateToken(any())).thenReturn("token");

        AuthResponse response = authService.register(request);

        assertThat(response.user().role()).isEqualTo(UserRole.CUSTOMER);
    }

    @Test
    void shouldRejectDuplicateEmail() {
        RegisterRequest request = new RegisterRequest(
                "Owner",
                "owner@gmanager.com",
                "Password123"
        );

        when(userRepository.existsByEmail("owner@gmanager.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("Email is already in use");

        verify(userRepository, never()).save(any());
    }

    @Test
    void shouldLoginUser() {
        LoginRequest request = new LoginRequest(
                "owner@gmanager.com",
                "Password123"
        );

        User user = new User(
                "Owner",
                "owner@gmanager.com",
                "hashed",
                UserRole.OWNER
        );

        when(userRepository.findByEmail("owner@gmanager.com")).thenReturn(Optional.of(user));
        when(jwtService.generateToken(any())).thenReturn("token");

        AuthResponse response = authService.login(request);

        assertThat(response.token()).isEqualTo("token");
        assertThat(response.user().email()).isEqualTo("owner@gmanager.com");

        verify(authenticationManager).authenticate(any());
    }
}