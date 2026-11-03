package com.game_manager.gm.gamingsession.operations;

import com.game_manager.gm.gamingsession.billing.GamingLedgerHealth;
import java.time.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/gaming-operations/health")
public class GamingPilotHealthController {
    private final JdbcTemplate jdbc;private final GamingLedgerHealth ledger;private final Clock clock;private final com.game_manager.gm.common.operations.BackupHealth backup;
    public GamingPilotHealthController(JdbcTemplate jdbc,GamingLedgerHealth ledger,Clock clock,com.game_manager.gm.common.operations.BackupHealth backup){this.jdbc=jdbc;this.ledger=ledger;this.clock=clock;this.backup=backup;}
    public record Status(Instant checkedAt,String backend,String database,String financialLedger,String backup){}
    @GetMapping @PreAuthorize("hasAuthority('GAMING_FINANCE_MANAGE')")
    public Status status(){
        String backupStatus=backup.health().getStatus().getCode();
        try {jdbc.queryForObject("SELECT 1",Integer.class);return new Status(clock.instant(),"UP","UP",ledger.health().getStatus().getCode(),backupStatus);}
        catch(org.springframework.dao.DataAccessException e){return new Status(clock.instant(),"UP","DOWN","UNKNOWN",backupStatus);}
    }
}
