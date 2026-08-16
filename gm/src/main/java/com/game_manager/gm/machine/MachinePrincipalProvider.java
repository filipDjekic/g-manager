package com.game_manager.gm.machine;
import com.game_manager.gm.common.error.ApplicationException;import org.springframework.http.HttpStatus;import org.springframework.security.core.context.SecurityContextHolder;import org.springframework.stereotype.Component;
@Component public class MachinePrincipalProvider {public MachinePrincipal require(){var auth=SecurityContextHolder.getContext().getAuthentication();if(auth==null||!(auth.getPrincipal() instanceof MachinePrincipal p))throw new ApplicationException(HttpStatus.UNAUTHORIZED,"Machine authentication is required");return p;}}
