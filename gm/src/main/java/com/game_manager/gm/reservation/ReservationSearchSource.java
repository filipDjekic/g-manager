package com.game_manager.gm.reservation;

import com.game_manager.gm.common.search.SearchEntry;
import com.game_manager.gm.common.search.SearchResourceType;
import com.game_manager.gm.common.search.SearchSource;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.Permission;
import com.game_manager.gm.common.security.RolePermissions;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ReservationSearchSource implements SearchSource {
    private final ReservationRepository repository;
    @Override public SearchResourceType type() { return SearchResourceType.RESERVATION; }

    @Override
    public List<SearchEntry> search(AuthenticatedUser actor, String query, int limit) {
        Specification<Reservation> visible = visibility(actor);
        if (visible == null) return List.of();
        return repository.findAll(visible.and(ReservationSpecifications.matchesSearch(query)), PageRequest.of(0, limit))
                .stream().map(reservation -> entry(actor, reservation)).toList();
    }

    @Override
    public Optional<SearchEntry> findVisible(AuthenticatedUser actor, UUID id) {
        Specification<Reservation> visible = visibility(actor);
        if (visible == null) return Optional.empty();
        return repository.findOne(visible.and((root, ignored, builder) -> builder.equal(root.get("id"), id)))
                .map(reservation -> entry(actor, reservation));
    }

    private Specification<Reservation> visibility(AuthenticatedUser actor) {
        if (RolePermissions.has(actor.role(), Permission.RESERVATION_READ_ALL)) return (root, ignored, builder) -> builder.conjunction();
        if (RolePermissions.has(actor.role(), Permission.RESERVATION_READ_OWN)) return ReservationSpecifications.hasCustomer(actor.id());
        return null;
    }
    private SearchEntry entry(AuthenticatedUser actor, Reservation reservation) {
        String route = RolePermissions.has(actor.role(), Permission.RESERVATION_READ_ALL) ? "/reservations" : "/my-reservations";
        return new SearchEntry(type(), reservation.getId(), "Rezervacija " + shortId(reservation.getId()),
                reservation.getStatus() + " · " + reservation.getStartTime(), route + "?focus=" + reservation.getId(), 60);
    }
    private String shortId(UUID id) { return "#" + id.toString().substring(0, 8); }
}
