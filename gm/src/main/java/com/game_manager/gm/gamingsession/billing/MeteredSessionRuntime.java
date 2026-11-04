package com.game_manager.gm.gamingsession.billing;
import com.game_manager.gm.gamingsession.*;
import com.game_manager.gm.gamingsession.command.*;
import com.game_manager.gm.user.UserRepository;
import com.game_manager.gm.resource.PhysicalResourceRepository;
import java.time.*;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service @RequiredArgsConstructor
public class MeteredSessionRuntime {
    private final GamingSessionRepository sessions;
    private final UserRepository users;
    private final PhysicalResourceRepository resources;
    private final GamingBillingService billing;
    private final StationCommandWriter commands;
    private final jakarta.persistence.EntityManager em;
    private final com.game_manager.gm.events.OutboxWriter outbox;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Value("${app.gaming-client.lease-duration-seconds:30}") private long meteredLeaseSeconds=30;
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void finish(UUID id) { update(id,false,true); }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void tick(UUID id,boolean renew) { update(id,renew,false); }
    private void update(UUID id,boolean renew,boolean finish) {
        var ref=sessions.findById(id).orElse(null);
        if(ref==null || ref.getBillingMode()!=GamingBillingMode.PREPAID_METERED) return;
        users.findByIdForUpdate(ref.getCustomerId());resources.findLocked(ref.getResourceId());
        em.refresh(ref,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);var s=ref;
        if(s.getStatus()!=GamingSessionStatus.ACTIVE) return;
        Instant now=clock.instant();billing.billMetered(s,now);
        if(finish || !now.isBefore(s.getEndsAt()) || !now.isBefore(s.getMeteredLeaseUntil())) {
            s.setStatus(finish?GamingSessionStatus.TERMINATED:GamingSessionStatus.EXPIRED);s.setEndedAt(s.getLastBilledAt());
            s.setTerminationReason(finish?"Customer finished gaming":!now.isBefore(s.getEndsAt())?(MeteredPricing.affordable(billing.availableCredit(s.getCustomerId()),s.getMeteredPrice(),s.getMeteredTariffSeconds(),s.getBillingUnitSeconds())>0?"Station reservation/access boundary reached":"Prepaid credit exhausted"):"Station lease expired");
            sessions.saveAndFlush(s);long sequence=commands.write(s,StationCommandType.SESSION_TERMINATED);
            outbox.write(finish?com.game_manager.gm.events.DomainEventType.GAMING_SESSION_TERMINATED:com.game_manager.gm.events.DomainEventType.GAMING_SESSION_EXPIRED,"GAMING_SESSION",s.getId(),java.util.Map.of("resourceId",s.getResourceId(),"locationId",s.getLocationId(),"endedAt",s.getEndedAt(),"commandSequence",sequence));
        } else if(renew) {
            s.setMeteredLeaseUntil(now.plusSeconds(meteredLeaseSeconds).isBefore(s.getEndsAt())?now.plusSeconds(meteredLeaseSeconds):s.getEndsAt());
        }
        sessions.saveAndFlush(s);
    }
}
