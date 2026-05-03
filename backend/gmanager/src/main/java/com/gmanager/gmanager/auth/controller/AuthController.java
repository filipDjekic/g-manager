package com.gmanager.gmanager.auth.controller;

import com.gmanager.gmanager.auth.dto.AuthResponse;
import com.gmanager.gmanager.auth.dto.LoginRequest;
import com.gmanager.gmanager.auth.dto.RegisterRequest;
import com.gmanager.gmanager.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }
}