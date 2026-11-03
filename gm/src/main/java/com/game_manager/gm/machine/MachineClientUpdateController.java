package com.game_manager.gm.machine;
import com.game_manager.gm.common.scheduling.ClientUpdatePort;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/machine/client-update") @RequiredArgsConstructor
public class MachineClientUpdateController {
    private final ClientUpdatePort updates;private final MachinePrincipalProvider principal;private final com.game_manager.gm.auth.RateLimitService limits;
    public record Claim(UUID requestId){}
    @PostMapping("/claim") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void claim(@RequestBody Claim claim){var machine=principal.require();limits.checkMachine(machine.stationId(),"client-update");updates.claim(machine.stationId(),machine.identityId(),claim.requestId());}
}
