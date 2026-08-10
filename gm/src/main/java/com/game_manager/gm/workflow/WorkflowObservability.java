package com.game_manager.gm.workflow;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class WorkflowObservability implements MeterBinder {
    private final WorkflowInstanceRepository instances;
    private final Clock clock;

    public WorkflowObservability(WorkflowInstanceRepository instances, Clock clock) {
        this.instances = instances;
        this.clock = clock;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder("gmanager.workflow.active", this, value -> value.active()).register(registry);
        Gauge.builder("gmanager.workflow.overdue", this, value -> value.overdue()).register(registry);
        Gauge.builder("gmanager.workflow.escalated", this, value -> value.escalated()).register(registry);
        Gauge.builder("gmanager.workflow.cycle.seconds", this, value -> value.averageCycleSeconds())
                .description("Average completion cycle time for completed workflow instances")
                .register(registry);
    }

    private long active() {
        return snapshot().stream().filter(instance -> instance.getStatus() == WorkflowStatus.ACTIVE).count();
    }

    private long overdue() {
        Instant now = clock.instant();
        return snapshot().stream()
                .filter(instance -> instance.getStatus() == WorkflowStatus.ACTIVE)
                .filter(instance -> instance.getDueAt() != null && instance.getDueAt().isBefore(now))
                .count();
    }

    private long escalated() {
        return snapshot().stream().filter(WorkflowInstance::isEscalated).count();
    }

    private double averageCycleSeconds() {
        return snapshot().stream()
                .filter(instance -> instance.getCompletedAt() != null)
                .mapToLong(instance -> Duration.between(instance.getCreatedAt(), instance.getCompletedAt()).toSeconds())
                .average()
                .orElse(0D);
    }

    private List<WorkflowInstance> snapshot() {
        return instances.findAll();
    }
}
