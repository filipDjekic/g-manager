package com.game_manager.gm.station;
import java.time.Instant;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/stations/{stationId}/client-updates") @RequiredArgsConstructor
public class StationClientUpdateController {
    private final StationClientUpdateService updates;
    public record Request(Instant notBefore,@NotBlank @Size(max=500)String reason){}
    @GetMapping public com.game_manager.gm.common.dto.PageResponse<StationClientUpdateService.Update> history(@PathVariable UUID stationId,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="10")int size){return updates.history(stationId,page,size);}
    @PostMapping public StationClientUpdateService.Update request(@PathVariable UUID stationId,@Valid @RequestBody Request request){return updates.request(stationId,request.notBefore(),request.reason());}
}
