package com.game_manager.gm.jobs;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class JobHandlerRegistry {
    private final Map<String, JobHandler> handlers;

    public JobHandlerRegistry(List<JobHandler> handlers) {
        Map<String, JobHandler> registered = new HashMap<>();
        for (JobHandler handler : handlers) {
            if (registered.put(handler.type(), handler) != null) {
                throw new IllegalStateException("Duplicate job handler: " + handler.type());
            }
        }
        this.handlers = Map.copyOf(registered);
    }

    public JobHandler require(String type) {
        JobHandler handler = handlers.get(type);
        if (handler == null) {
            throw new IllegalStateException("No job handler registered for " + type);
        }
        return handler;
    }
}
