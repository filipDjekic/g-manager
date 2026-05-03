package com.gmanager.gmanager.auth.service;

import com.gmanager.gmanager.auth.dto.AuthResponse;
import com.gmanager.gmanager.auth.dto.LoginRequest;
import com.gmanager.gmanager.auth.dto.RegisterRequest;
import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.common.exception.UnauthorizedException;
import com.gmanager.gmanager.security.jwt.JwtService;
import com.gmanager.gmanager.security.user.SecurityUser;
import com.gmanager.gmanager.user.domain.User;
import com.gmanager.gmanager.user.domain.UserRole;
import com.gmanager.gmanager.user.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final long jwtExpirationMs;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            JwtService jwtService,
            @Value("${app.jwt.expiration-ms}") long jwtExpirationMs
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.jwtExpirationMs = jwtExpirationMs;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());

        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email is already in use");
        }

        UserRole role = userRepository.count() == 0 ? UserRole.OWNER : UserRole.CUSTOMER;

        User user = new User(
                request.name().trim(),
                email,
                passwordEncoder.encode(request.password()),
                role
        );

        User savedUser = userRepository.save(user);

        SecurityUser securityUser = new SecurityUser(savedUser);
        String token = jwtService.generateToken(securityUser);

        return toAuthResponse(savedUser, token);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.email());

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password())
            );
        } catch (DisabledException ex) {
            throw new UnauthorizedException("User account is inactive");
        } catch (BadCredentialsException ex) {
            throw new UnauthorizedException("Invalid email or password");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        if (!user.isActive()) {
            throw new UnauthorizedException("User account is inactive");
        }

        String token = jwtService.generateToken(new SecurityUser(user));

        return toAuthResponse(user, token);
    }

    private AuthResponse toAuthResponse(User user, String token) {
        return new AuthResponse(
                token,
                "Bearer",
                jwtExpirationMs,
                new AuthResponse.UserResponse(
                        user.getId(),
                        user.getName(),
                        user.getEmail(),
                        user.getRole(),
                        user.isActive()
                )
        );
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}