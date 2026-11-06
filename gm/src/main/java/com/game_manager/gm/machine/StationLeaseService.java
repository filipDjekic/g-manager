package com.game_manager.gm.machine;import static com.game_manager.gm.machine.dto.MachineDtos.*;import com.game_manager.gm.common.error.ApplicationException;import com.game_manager.gm.gamingsession.*;import com.game_manager.gm.gamingsession.command.*;import com.game_manager.gm.machine.dto.StationLeaseDtos.SessionLeasePayload;import com.game_manager.gm.station.*;import java.time.*;import java.util.*;import org.springframework.beans.factory.annotation.Value;import org.springframework.http.HttpStatus;import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;import tools.jackson.databind.ObjectMapper;
@Service public class StationLeaseService {
 @org.springframework.beans.factory.annotation.Autowired private com.game_manager.gm.gamingsession.billing.GamingTimeService time;private final MachinePrincipalProvider principal;private final GamingSessionRepository sessions;private final GamingStationProfileRepository stations;private final ApplicationProfileRepository profiles;private final StationHeartbeatRepository heartbeats;private final StationCommandRepository commands;private final StationPolicySigner signer;private final StationEnforcementProjectionService enforcement;private final ObjectMapper json;private final Clock clock;private final Duration duration,grace;@org.springframework.beans.factory.annotation.Autowired private com.game_manager.gm.common.scheduling.ClientUpdatePort updates;
 public StationLeaseService(MachinePrincipalProvider principal,GamingSessionRepository sessions,GamingStationProfileRepository stations,ApplicationProfileRepository profiles,StationHeartbeatRepository heartbeats,StationCommandRepository commands,StationPolicySigner signer,StationEnforcementProjectionService enforcement,ObjectMapper json,Clock clock,@Value("${app.gaming-client.lease-duration-seconds:30}")long duration,@Value("${app.gaming-client.offline-grace-seconds:30}")long grace){this.principal=principal;this.sessions=sessions;this.stations=stations;this.profiles=profiles;this.heartbeats=heartbeats;this.commands=commands;this.signer=signer;this.enforcement=enforcement;this.json=json;this.clock=clock;this.duration=Duration.ofSeconds(duration);this.grace=Duration.ofSeconds(grace);}
 @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
 public SignedSessionLease lease() {
  MachinePrincipal machine=principal.require();Instant now=clock.instant();
  GamingStationProfile station=StationConfigurationService.requireEnabledStation(stations,machine.stationId());
  long configVersion=StationConfigurationService.requireActiveProfile(profiles,station).getConfigurationVersion();
  GamingSession session=sessions.findByResourceIdAndStatus(machine.stationId(),GamingSessionStatus.ACTIVE).orElse(null);
  if(session!=null && session.getBillingMode()==GamingBillingMode.TIME_BALANCE)time.tick(session.getId(),true,false);
  boolean active=session!=null && session.getBillingMode()==GamingBillingMode.TIME_BALANCE && session.getStatus()==GamingSessionStatus.ACTIVE && session.getMoveTargetId()==null && session.getEndsAt().isAfter(now);
  boolean timed=active && session.getBillingMode()==GamingBillingMode.TIME_BALANCE;
  long cursor=commands.currentCursor(machine.stationId().toString());
  Instant expires=now.plus(duration);
  if(active && session.getEndsAt().isBefore(expires))expires=session.getEndsAt();
  if(timed && session.getMeteredLeaseUntil().isBefore(expires))expires=session.getMeteredLeaseUntil();
  Instant graceEnd=expires.plus(grace);
  if(active && session.getEndsAt().isBefore(graceEnd))graceEnd=session.getEndsAt();
  if(timed){graceEnd=expires;session.setMeteredLeaseUntil(expires);}
  var waiting=active?null:time.waiting(machine.stationId());UUID leaseId=UUID.randomUUID();
  SessionLeasePayload payload=new SessionLeasePayload(leaseId,machine.stationId(),active?session.getId():null,
   active?session.getCustomerId():null,active?session.getEndsAt():null,configVersion,now,expires,graceEnd,cursor,
   active?"ACTIVE":"LOCK",updates.directive(machine.stationId()),active?session.getBillingMode().name():null,
   active?session.getStartedAt():null,null,null,timed?(session.getEndsAt().equals(session.getAccessUntil())?"BOUNDARY":"TIME"):null,
   timed?time.balance(session.getCustomerId()):null,waiting==null?null:UUID.fromString(waiting.get("id").toString()),
   waiting==null?null:((java.sql.Timestamp)waiting.get("expires_at")).toInstant());
  try {
   byte[] bytes=json.writeValueAsBytes(payload);enforcement.leaseIssued(machine,leaseId,payload.sessionId(),expires,configVersion,cursor);
   return new SignedSessionLease(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes),"Ed25519",signer.keyId(),signer.sign(bytes));
  } catch(Exception e) {
   if(e instanceof ApplicationException application)throw application;
   throw new ApplicationException(HttpStatus.INTERNAL_SERVER_ERROR,"Station lease could not be serialized");
  }
 }
 @Transactional public LockAckResponse lockAck(LockAckRequest request){MachinePrincipal machine=principal.require();StationCommand command=commands.findByStationIdAndSequence(machine.stationId(),request.commandSequence()).filter(value->value.getSessionId().equals(request.sessionId())&&(value.getCommandType()==StationCommandType.SESSION_TERMINATED||value.getCommandType()==StationCommandType.FORCE_LOCK)).orElseThrow(()->new ApplicationException(HttpStatus.CONFLICT,"Lock acknowledgement does not match a lock command"));Instant at=enforcement.lockAck(machine,request.sessionId(),request.commandSequence(),request.leaseId(),request.reason());if(command.getAcknowledgedAt()==null){command.setAcknowledgedAt(at);commands.save(command);}return new LockAckResponse(machine.stationId(),request.sessionId(),request.commandSequence(),at,StationEnforcementStatus.LOCKED.name());}
}
