package com.game_manager.gm.machine;
import com.game_manager.gm.machine.dto.MachineDtos.*;import java.util.*;import lombok.RequiredArgsConstructor;import org.springframework.http.*;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/stations/{stationId}/machine-identity") @RequiredArgsConstructor
public class MachineIdentityAdminController {private final MachineIdentityAdminService service;
 @PostMapping("/enrollment-token")public ResponseEntity<EnrollmentTokenResponse> enrollment(@PathVariable UUID stationId){return ResponseEntity.status(HttpStatus.CREATED).body(service.createToken(stationId,EnrollmentPurpose.INITIAL));}
 @PostMapping("/rotation-token")public ResponseEntity<EnrollmentTokenResponse> rotation(@PathVariable UUID stationId){return ResponseEntity.status(HttpStatus.CREATED).body(service.createToken(stationId,EnrollmentPurpose.ROTATION));}
 @GetMapping public List<MachineIdentityView> identities(@PathVariable UUID stationId){return service.identities(stationId);}
 @PostMapping("/revoke")@ResponseStatus(HttpStatus.NO_CONTENT)public void revoke(@PathVariable UUID stationId){service.revoke(stationId);}
}
