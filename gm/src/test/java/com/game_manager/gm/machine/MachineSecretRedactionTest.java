package com.game_manager.gm.machine;

import static org.assertj.core.api.Assertions.assertThat;
import com.game_manager.gm.machine.dto.MachineDtos.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class MachineSecretRedactionTest {
    @Test void routineObjectLoggingNeverIncludesProtocolCredentialsWhileJsonPreservesTheContract(){
        String secret="sensitive-pilot-credential";UUID id=UUID.randomUUID();Instant now=Instant.now();
        List<Object> values=List.of(new EnrollmentTokenResponse(id,id,EnrollmentPurpose.INITIAL,secret,now),
                new EnrollRequest(secret,"public-key","test"),new ChallengeResponse(id,id,secret,now,"Ed25519"),
                new TokenRequest(id,id,secret,secret),new MachineTokenResponse(secret,now,"Bearer"),
                new SessionLoginRequest("user@example.test",secret),new com.game_manager.gm.auth.dto.LoginRequest("user@example.test",secret),
                new com.game_manager.gm.auth.dto.AuthResponse(secret,now,null));
        var json=new ObjectMapper();for(Object value:values){assertThat(value.toString()).doesNotContain(secret);assertThat(json.writeValueAsString(value)).contains(secret);}
    }
}
