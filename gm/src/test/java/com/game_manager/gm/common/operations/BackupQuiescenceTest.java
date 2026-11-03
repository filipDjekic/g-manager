package com.game_manager.gm.common.operations;
import static org.assertj.core.api.Assertions.*;
import com.game_manager.gm.common.error.ApplicationException;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class BackupQuiescenceTest {
    @Test void restartedOrExpiredCoordinatorCannotApproveAnOldBackup() throws Exception {
        var time=new AtomicReference<>(Instant.parse("2026-11-03T12:00:00Z"));
        Clock clock=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return time.get();}};
        var barrier=new BackupQuiescence(clock);var lease=barrier.begin();
        assertThatThrownBy(barrier::enter).isInstanceOf(ApplicationException.class);
        assertThatThrownBy(()->new BackupQuiescence(clock).verify(lease.id())).isInstanceOf(ApplicationException.class);
        time.set(time.get().plusSeconds(601));
        assertThatThrownBy(()->barrier.verify(lease.id())).isInstanceOf(ApplicationException.class);
        try(var writer=barrier.enter()){assertThat(writer).isNotNull();}
    }
    @Test void backupWaitsForAdmittedWritersAndTheirNestedTransactions() throws Exception {
        var barrier=new BackupQuiescence(Clock.systemUTC());
        try(var executor=Executors.newFixedThreadPool(2)){
            var writer=barrier.enter();
            try {
                var lease=executor.submit(barrier::begin);
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean held=false;
                while(!held&&System.nanoTime()<deadline){
                    held=executor.submit(()->{try(var attempt=barrier.enter()){return false;}catch(ApplicationException expected){return true;}}).get(1,TimeUnit.SECONDS);
                }
                assertThat(held).isTrue();assertThat(lease.isDone()).isFalse();
                try(var nested=barrier.enter()){assertThat(nested).isNotNull();}
                writer.close();writer=null;
                barrier.end(lease.get(5,TimeUnit.SECONDS).id());
            } finally {if(writer!=null)writer.close();}
        }
    }
}
