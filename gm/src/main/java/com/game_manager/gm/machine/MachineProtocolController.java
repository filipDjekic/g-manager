package com.game_manager.gm.machine;
import com.game_manager.gm.machine.dto.MachineDtos.*;import jakarta.validation.Valid;import java.util.*;import lombok.RequiredArgsConstructor;import org.springframework.http.*;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/machine") @RequiredArgsConstructor public class MachineProtocolController {private final MachineProtocolService service;private final StationConfigurationService configuration;private final StationLeaseService leases;private final StationEnforcementProjectionService enforcement;private final MachinePrincipalProvider principal;
 @PostMapping("/enroll")public ResponseEntity<EnrollResponse> enroll(@Valid@RequestBody EnrollRequest r){return ResponseEntity.status(HttpStatus.CREATED).body(service.enroll(r));}
 @PostMapping("/auth/challenge")public ChallengeResponse challenge(@Valid@RequestBody ChallengeRequest r){return service.challenge(r);}
 @PostMapping("/auth/token")public MachineTokenResponse token(@Valid@RequestBody TokenRequest r){return service.token(r);}
 @PostMapping("/heartbeat")@ResponseStatus(HttpStatus.NO_CONTENT)public void heartbeat(@Valid@RequestBody HeartbeatRequest r){service.heartbeat(r);enforcement.heartbeat(principal.require(),r.enforcementStatus(),r.sessionId(),r.leaseId(),r.configurationVersion()==null?0:r.configurationVersion(),r.lastCommandSequence());}
 @GetMapping("/snapshot")public MachineSnapshotResponse snapshot(){return service.snapshot();}
 @GetMapping("/commands")public List<MachineCommandResponse> commands(@RequestParam(defaultValue="0")long afterSequence){return service.poll(afterSequence);}
 @PostMapping("/commands/{sequence}/ack")public CommandAckResponse ack(@PathVariable long sequence){return service.acknowledge(sequence);}
 @PostMapping("/session-login")public SessionLoginResponse sessionLogin(@Valid@RequestBody SessionLoginRequest r){return service.sessionLogin(r);}
 @PostMapping("/session-logout")@ResponseStatus(HttpStatus.NO_CONTENT)public void sessionLogout(@Valid@RequestBody SessionLogoutRequest r){service.sessionLogout(r);}
 @GetMapping("/configuration")public com.game_manager.gm.machine.dto.StationPolicyDtos.SignedStationPolicy configuration(){return configuration.current();}
 @GetMapping("/lease")public SignedSessionLease lease(){return leases.lease();}
 @PostMapping("/enforcement/lock-ack")public LockAckResponse lockAck(@Valid@RequestBody LockAckRequest request){return leases.lockAck(request);}
}
