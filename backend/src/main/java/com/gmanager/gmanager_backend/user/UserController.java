package com.gmanager.gmanager_backend.user;

import com.gmanager.gmanager_backend.user.dto.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;
    public UserController(UserService userService) { this.userService = userService; }

    @GetMapping("/me")
    public UserResponse me(Authentication authentication) { return userService.me(authentication); }

    @GetMapping("/employees")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public List<UserResponse> employees(Authentication authentication) { return userService.employees(authentication); }

    @PostMapping("/employees")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public UserResponse create(@Valid @RequestBody CreateUserRequest request, Authentication authentication) { return userService.create(request, authentication); }

    @PutMapping("/employees/{id}")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public UserResponse update(@PathVariable Long id, @Valid @RequestBody UpdateUserRequest request, Authentication authentication) { return userService.update(id, request, authentication); }

    @PatchMapping("/employees/{id}/active")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public UserResponse active(@PathVariable Long id, @RequestParam boolean active, Authentication authentication) { return userService.setActive(id, active, authentication); }

    @PatchMapping("/{id}/password")
    public void changePassword(@PathVariable Long id, @Valid @RequestBody ChangePasswordRequest request, Authentication authentication) { userService.changePassword(id, request, authentication); }
}
