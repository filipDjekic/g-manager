package com.game_manager.gm.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.util.DisconnectedClientHelper;

@Component
public class CommittedResponseExceptionResolver implements HandlerExceptionResolver, Ordered {
    @Override
    public int getOrder() { return Ordered.HIGHEST_PRECEDENCE; }

    @Override
    public ModelAndView resolveException(HttpServletRequest request, HttpServletResponse response,
            Object handler, Exception exception) {
        if (DisconnectedClientHelper.isClientDisconnectedException(exception)) return new ModelAndView();
        if (!response.isCommitted()) return null;
        if (!(exception instanceof ApplicationException || exception instanceof AccessDeniedException
                || exception instanceof AuthenticationException))
            GlobalExceptionHandler.logUnexpected(exception, request);
        // An SSE response cannot be converted to JSON or assigned a new HTTP status.
        return new ModelAndView();
    }
}