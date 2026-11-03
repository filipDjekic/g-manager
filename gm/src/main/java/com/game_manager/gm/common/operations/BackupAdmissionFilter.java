package com.game_manager.gm.common.operations;

import com.game_manager.gm.common.error.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** After authentication, before idempotency claims: a 503 must never become a stored payment result. */
@Component @Order(-90) @RequiredArgsConstructor
public class BackupAdmissionFilter extends OncePerRequestFilter {
    private final BackupQuiescence barrier;private final ApiErrorFactory errors;private final ObjectMapper json;
    @Override protected boolean shouldNotFilter(HttpServletRequest request){return !request.getRequestURI().startsWith("/api/v1/")||request.getRequestURI().startsWith("/api/v1/machine/")||java.util.Set.of("GET","HEAD","OPTIONS").contains(request.getMethod());}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        AutoCloseable permit;
        try {permit=barrier.enter();}
        catch(ApplicationException e){response.setStatus(503);response.setHeader("Retry-After","30");response.setContentType(MediaType.APPLICATION_JSON_VALUE);json.writeValue(response.getOutputStream(),errors.create(HttpStatus.SERVICE_UNAVAILABLE,e.getMessage(),request));return;}
        try {chain.doFilter(request,response);}
        finally {try{permit.close();}catch(Exception e){throw new ServletException("Backup admission cleanup failed",e);}}
    }
}
