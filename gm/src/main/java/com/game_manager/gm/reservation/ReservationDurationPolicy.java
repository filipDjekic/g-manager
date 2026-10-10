package com.game_manager.gm.reservation;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.common.config.GamingSessionProperties;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.resource.PhysicalResourceRepository;
import com.game_manager.gm.resource.ResourceType;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReservationDurationPolicy {
    private static final Set<ResourceType> GAMING = Set.of(ResourceType.GAMING_PC, ResourceType.PLAYSTATION, ResourceType.SIMULATOR);
    private final PhysicalResourceRepository resources;
    private final GamingSessionProperties gaming;

    public record Rules(boolean variable, int minimum, int maximum, int defaultMinutes) {}

    public Rules rules(CatalogItem service) {
        requireDuration(service);
        boolean variable = resources.findByServiceIdOrderByIdAsc(service.getId()).stream()
                .anyMatch(resource -> GAMING.contains(resource.getType()));
        int duration = service.getDurationMinutes();
        return new Rules(variable, variable ? Math.max(30, gaming.minimumDurationMinutes()) : duration,
                variable ? gaming.maximumDurationMinutes() : duration, duration);
    }

    public int resolve(CatalogItem service, Integer requested) {
        requireDuration(service);
        // Older clients retain the catalog duration when no override is sent.
        if (requested == null) return service.getDurationMinutes();
        Rules rules = rules(service);
        if (!rules.variable() && requested != rules.defaultMinutes())
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "This service has a fixed reservation duration");
        if (requested < rules.minimum() || requested > rules.maximum())
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Reservation duration is outside the permitted range");
        return requested;
    }

    private void requireDuration(CatalogItem service) {
        if (service.getDurationMinutes()==null || service.getDurationMinutes()<=0)
            throw new ApplicationException(HttpStatus.UNPROCESSABLE_ENTITY,"Service has no valid reservation duration");
    }
}
