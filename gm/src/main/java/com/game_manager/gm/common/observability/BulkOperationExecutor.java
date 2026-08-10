package com.game_manager.gm.common.observability;

import com.game_manager.gm.common.dto.BulkItemOutcome;
import com.game_manager.gm.common.dto.BulkOperationResponse;
import com.game_manager.gm.common.error.ApplicationException;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;

@Component
@RequiredArgsConstructor
public class BulkOperationExecutor {
    private final MeterRegistry meterRegistry;

    public <T> BulkOperationResponse execute(String resource, Collection<T> items,
            Function<T, UUID> id, Consumer<T> operation) {
        Timer.Sample sample = Timer.start(meterRegistry);
        var outcomes = new ArrayList<BulkItemOutcome>(items.size());
        for (T item : items) {
            try {
                operation.accept(item);
                outcomes.add(new BulkItemOutcome(id.apply(item), true, "Operacija je uspešna"));
            } catch (ApplicationException exception) {
                outcomes.add(new BulkItemOutcome(id.apply(item), false, safeMessage(exception.getStatus())));
            } catch (RuntimeException exception) {
                outcomes.add(new BulkItemOutcome(id.apply(item), false, "Operacija nije uspela"));
            }
        }
        int succeeded = (int) outcomes.stream().filter(BulkItemOutcome::success).count();
        int failed = outcomes.size() - succeeded;
        meterRegistry.counter("gm.bulk.items", "resource", resource, "outcome", "success").increment(succeeded);
        meterRegistry.counter("gm.bulk.items", "resource", resource, "outcome", "failure").increment(failed);
        sample.stop(meterRegistry.timer("gm.bulk.duration", "resource", resource));
        return new BulkOperationResponse(outcomes.size(), succeeded, failed, outcomes);
    }

    private static String safeMessage(HttpStatus status) {
        return switch (status) {
            case FORBIDDEN -> "Nije dozvoljeno";
            case NOT_FOUND -> "Resurs nije pronađen";
            case CONFLICT -> "Resurs je u međuvremenu izmenjen";
            default -> "Operacija nije uspela";
        };
    }
}
