package com.gmanager.gmanager.user.controller;

import com.gmanager.gmanager.security.user.SecurityUser;
import com.gmanager.gmanager.user.dto.*;
import com.gmanager.gmanager.user.service.UserService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public UserResponse getMe(@AuthenticationPrincipal SecurityUser currentUser) {
        return userService.getMe(currentUser);
    }

    @PutMapping("/me")
    public UserResponse updateMe(
            @AuthenticationPrincipal SecurityUser currentUser,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return userService.updateMe(currentUser, request);
    }

    @GetMapping
    public Page<UserResponse> getUsers(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable
    ) {
        return userService.getUsers(currentUser, pageable);
    }

    @GetMapping("/{id}")
    public UserResponse getUserById(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id
    ) {
        return userService.getUserById(currentUser, id);
    }

    @PostMapping
    public UserResponse createUser(
            @AuthenticationPrincipal SecurityUser currentUser,
            @Valid @RequestBody CreateUserRequest request
    ) {
        return userService.createUser(currentUser, request);
    }

    @PutMapping("/{id}")
    public UserResponse updateUser(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRequest request
    ) {
        return userService.updateUser(currentUser, id, request);
    }

    @PatchMapping("/{id}/role")
    public UserResponse updateRole(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRoleRequest request
    ) {
        return userService.updateRole(currentUser, id, request);
    }

    @PatchMapping("/{id}/status")
    public UserResponse updateStatus(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserStatusRequest request
    ) {
        return userService.updateStatus(currentUser, id, request);
    }

    @DeleteMapping("/{id}")
    public void deactivateUser(
            @AuthenticationPrincipal SecurityUser currentUser,
            @PathVariable Long id
    ) {
        userService.deactivateUser(currentUser, id);
    }
}