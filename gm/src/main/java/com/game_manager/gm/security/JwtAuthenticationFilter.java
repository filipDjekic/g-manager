package com.game_manager.gm.security;

import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.RolePermissions;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.stream.Stream;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ") && SecurityContextHolder.getContext().getAuthentication() == null)
            authenticate(header.substring(7), request, response);
        chain.doFilter(request, response);
    }

    private void authenticate(String token, HttpServletRequest request, HttpServletResponse response) {
        JwtService.UserTokenClaims claims;
        try {
            claims = jwtService.parseUser(token);
        } catch (JwtException | IllegalArgumentException exception) {
            SecurityContextHolder.clearContext();
            return;
        }
        User user = userRepository.findById(claims.userId()).filter(User::isActive)
                .filter(value -> !value.isDeleted()).orElse(null);
        if (user == null) return;
        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getEmail(), user.getRole());
        var authorities = Stream.concat(
                Stream.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())),
                RolePermissions.forRole(user.getRole()).stream()
                        .map(permission -> new SimpleGrantedAuthority(permission.name()))).toList();
        var authentication = new UsernamePasswordAuthenticationToken(principal, null, authorities);
        authentication.setDetails(claims.expiresAt());
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        new RequestAttributeSecurityContextRepository().saveContext(context, request, response);
    }
}