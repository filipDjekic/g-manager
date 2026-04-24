package com.gmanager.gmanager_backend.auth;

import com.gmanager.gmanager_backend.exception.BadRequestException;
import com.gmanager.gmanager_backend.exception.UnauthorizedException;
import com.gmanager.gmanager_backend.security.JwtService;
import com.gmanager.gmanager_backend.user.Role;
import com.gmanager.gmanager_backend.user.User;
import com.gmanager.gmanager_backend.user.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
                       AuthenticationManager authenticationManager) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) throw new BadRequestException("Email is already registered");

        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(Role.CUSTOMER);
        User saved = userRepository.save(user);
        return toAuthResponse(saved);
    }

    public AuthResponse login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        try {
            authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(email, request.password()));
        } catch (BadCredentialsException exception) {
            throw new UnauthorizedException("Invalid email or password");
        }
        User user = userRepository.findByEmail(email).orElseThrow(() -> new UnauthorizedException("Invalid email or password"));
        if (!user.isActive()) throw new UnauthorizedException("Account is deactivated");
        return toAuthResponse(user);
    }

    private AuthResponse toAuthResponse(User user) {
        return new AuthResponse(
                jwtService.generateToken(user),
                new AuthResponse.UserResponse(user.getId(), user.getName(), user.getEmail(), user.getRole(), user.isActive())
        );
    }
}
