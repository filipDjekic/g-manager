package com.game_manager.gm.gamingsession;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.*;
import com.game_manager.gm.gamingsession.dto.*;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GamingSessionService {
    private final com.game_manager.gm.gamingsession.billing.GamingTimeService time;
    private final GamingSessionRepository sessions;
    private final GamingSessionLocationPolicy locations;
    private final CurrentUserProvider currentUser;
    private final Clock clock;

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("hasAuthority('GAMING_SESSION_TERMINATE')")
    public GamingSessionResponse terminate(UUID id, TerminateGamingSessionRequest request) {
        var actor=currentUser.requireCurrentUser();
        var session=sessions.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Session not found"));
        locations.requireResourceManagement(actor,session.getResourceId(),Permission.GAMING_SESSION_TERMINATE);
        if(session.getBillingMode()==GamingBillingMode.TIME_BALANCE)time.finishByOperator(id,request.reason());
        else if(session.getStatus()==GamingSessionStatus.ACTIVE)throw new ApplicationException(HttpStatus.CONFLICT,"Legacy session must be reconciled before continuing");
        return GamingSessionResponse.from(session,clock.instant());
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PreAuthorize("isAuthenticated()")
    public GamingSessionResponse finishOwn(UUID id) {
        var actor=currentUser.requireCurrentUser();
        var session=sessions.findById(id).orElseThrow(()->new ApplicationException(HttpStatus.NOT_FOUND,"Session not found"));
        if(actor.role()!=Role.CUSTOMER || !actor.id().equals(session.getCustomerId()) || session.getBillingMode()!=GamingBillingMode.TIME_BALANCE)
            throw new ApplicationException(HttpStatus.FORBIDDEN,"Own gaming session required");
        time.tick(id,false,true);
        return GamingSessionResponse.from(session,clock.instant());
    }
    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public GamingSessionResponse get(UUID id) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        GamingSession session = sessions.findById(id)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Gaming session not found"));
        locations.requireResourceAccess(actor, session.getResourceId());
        return GamingSessionResponse.from(session, clock.instant());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public List<GamingSessionResponse> active() {
        AuthenticatedUser actor = currentUser.requireCurrentUser(); Instant now = clock.instant();
        Set<UUID> assigned=locations.assignedResources(actor);
        boolean all=actor.role()==Role.OWNER || actor.role()==Role.ADMIN;
        return sessions.findByStatusOrderByStartedAtDesc(GamingSessionStatus.ACTIVE).stream()
                .filter(value -> all || assigned.contains(value.getResourceId()))
                .map(value -> GamingSessionResponse.from(value, now)).toList();
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN')")
    // Operational active-session snapshot, independent of the historical page.
    public List<GamingSessionVisitResponse> myVisits() {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        if (actor.role() != Role.CUSTOMER)
            throw new ApplicationException(HttpStatus.FORBIDDEN, "Customer account is required");
        return sessions.customerVisits(actor.id(), true, List.of(actor.id()), clock.instant(),
                org.springframework.data.domain.PageRequest.of(0, 20));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public List<GamingSessionVisitResponse> customerVisits(UUID customerId) {
        AuthenticatedUser actor = currentUser.requireCurrentUser();
        boolean all = actor.role() == Role.OWNER || actor.role() == Role.ADMIN;
        Set<UUID> assigned = locations.assignedResources(actor);
        if (!all && assigned.isEmpty()) return List.of();
        return sessions.customerVisits(customerId, all, all ? List.of(actor.id()) : assigned, clock.instant(),
                org.springframework.data.domain.PageRequest.of(0, 20));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('RESERVATION_READ_OWN')")
    public com.game_manager.gm.common.dto.PageResponse<GamingSessionVisitResponse> myVisitPage(int page,int size) {
        var actor=currentUser.requireCurrentUser();
        if(actor.role()!=Role.CUSTOMER)throw new ApplicationException(HttpStatus.FORBIDDEN,"Customer account is required");
        return com.game_manager.gm.common.dto.PageResponse.from(sessions.visitPage(actor.id(),true,List.of(actor.id()),clock.instant(),com.game_manager.gm.common.dto.PageRequests.of(page,size,org.springframework.data.domain.Sort.unsorted())));
    }
    @Transactional(readOnly = true)
    @PreAuthorize("hasAuthority('GAMING_SESSION_READ')")
    public com.game_manager.gm.common.dto.PageResponse<GamingSessionVisitResponse> customerVisitPage(UUID customerId,int page,int size) {
        var actor=currentUser.requireCurrentUser(); boolean all=actor.role()==Role.OWNER||actor.role()==Role.ADMIN;
        var assigned=locations.assignedResources(actor);
        var pageable=com.game_manager.gm.common.dto.PageRequests.of(page,size,org.springframework.data.domain.Sort.unsorted());
        if(!all&&assigned.isEmpty())return com.game_manager.gm.common.dto.PageResponse.from(org.springframework.data.domain.Page.empty(pageable));
        return com.game_manager.gm.common.dto.PageResponse.from(sessions.visitPage(customerId,all,all?List.of(actor.id()):assigned,clock.instant(),pageable));
    }

}
