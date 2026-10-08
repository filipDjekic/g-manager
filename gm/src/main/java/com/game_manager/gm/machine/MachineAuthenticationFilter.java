package com.game_manager.gm.machine;

import com.game_manager.gm.security.JwtService;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class MachineAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwt;
    private final StationMachineIdentityRepository identities;
    private final Clock clock;
    private final MachineProtocolObservability metrics;

    public MachineAuthenticationFilter(JwtService jwt, StationMachineIdentityRepository identities,
            Clock clock, MachineProtocolObservability metrics) {
        this.jwt = jwt;
        this.identities = identities;
        this.clock = clock;
        this.metrics = metrics;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/machine/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) authenticate(header.substring(7), request, response);
        chain.doFilter(request, response);
    }

    private void authenticate(String token, HttpServletRequest request, HttpServletResponse response) {
        JwtService.MachineTokenClaims claims;
        try {
            claims = jwt.parseMachine(token);
        } catch (JwtException | IllegalArgumentException exception) {
            failed();
            return;
        }
        StationMachineIdentity identity = identities.findById(claims.identityId()).orElse(null);
        if (identity == null || !identity.getStationId().equals(claims.stationId())
                || identity.getKeyVersion() != claims.keyVersion() || identity.getStatus() == MachineIdentityStatus.REVOKED
                || identity.getStatus() == MachineIdentityStatus.ROTATING
                    && (identity.getOverlapExpiresAt() == null || !identity.getOverlapExpiresAt().isAfter(clock.instant()))) {
            failed();
            return;
        }
        MachinePrincipal principal = new MachinePrincipal(identity.getId(), identity.getStationId(), identity.getKeyVersion());
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("MACHINE_PROTOCOL"))));
        SecurityContextHolder.setContext(context);
        new RequestAttributeSecurityContextRepository().saveContext(context, request, response);
    }

    private void failed() {
        metrics.authenticationFailed();
        SecurityContextHolder.clearContext();
    }
}