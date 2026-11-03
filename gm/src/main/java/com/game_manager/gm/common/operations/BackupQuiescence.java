package com.game_manager.gm.common.operations;

import com.game_manager.gm.common.error.ApplicationException;
import java.time.*;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Brief write barrier. A restarted backend invalidates the lease and therefore the backup. */
@Component
public class BackupQuiescence {
    private final Clock clock;
    private UUID lease;
    private Instant expiresAt;
    private int writers;
    private final ThreadLocal<Integer> depth=ThreadLocal.withInitial(()->0);
    public BackupQuiescence(Clock clock) { this.clock=clock; }
    public synchronized AutoCloseable enter() {
        expire();
        if(lease!=null&&depth.get()==0)throw new ApplicationException(HttpStatus.SERVICE_UNAVAILABLE,"Backup in progress; retry the same request and idempotency key");
        if(depth.get()==0)writers++;
        depth.set(depth.get()+1);
        return ()->{synchronized(this){int remaining=depth.get()-1;if(remaining==0){depth.remove();writers--;notifyAll();}else depth.set(remaining);}};
    }
    public synchronized Lease begin() throws InterruptedException {
        expire();
        if(lease!=null)throw new ApplicationException(HttpStatus.CONFLICT,"Another backup is in progress");
        UUID id=UUID.randomUUID();lease=id;expiresAt=clock.instant().plusSeconds(600);
        long deadline=System.nanoTime()+Duration.ofSeconds(30).toNanos();
        while(writers>0){
            if(System.nanoTime()>=deadline){lease=null;expiresAt=null;throw new ApplicationException(HttpStatus.CONFLICT,"Writes did not drain; backup was not started");}
            try {wait(100);}catch(InterruptedException e){lease=null;expiresAt=null;throw e;}
        }
        return new Lease(id,expiresAt);
    }
    public synchronized Lease verify(UUID id) {
        expire();
        if(lease==null||!lease.equals(id))throw new ApplicationException(HttpStatus.CONFLICT,"Backup lease expired or server restarted; discard this backup set");
        return new Lease(lease,expiresAt);
    }
    public synchronized void end(UUID id){verify(id);lease=null;expiresAt=null;notifyAll();}
    private void expire(){if(expiresAt!=null&&!expiresAt.isAfter(clock.instant())){lease=null;expiresAt=null;}}
    public record Lease(UUID id,Instant expiresAt){}
}
