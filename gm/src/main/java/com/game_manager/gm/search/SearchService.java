package com.game_manager.gm.search;

import com.game_manager.gm.auth.RateLimitService;
import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.search.SearchEntry;
import com.game_manager.gm.common.search.SearchResourceType;
import com.game_manager.gm.common.search.SearchSource;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.common.web.NavigationActionResponse;
import com.game_manager.gm.search.dto.SearchPreferenceRequest;
import com.game_manager.gm.search.dto.SearchResponse;
import com.game_manager.gm.search.dto.SearchResultResponse;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class SearchService {
    private final Map<SearchResourceType, SearchSource> sources = new EnumMap<>(SearchResourceType.class);
    private final SearchPreferenceRepository preferences;
    private final CurrentUserProvider currentUserProvider;
    private final RateLimitService rateLimitService;
    private final MeterRegistry meterRegistry;
    private final Clock clock;

    public SearchService(List<SearchSource> sources, SearchPreferenceRepository preferences,
            CurrentUserProvider currentUserProvider, RateLimitService rateLimitService,
            MeterRegistry meterRegistry, Clock clock) {
        sources.forEach(source -> this.sources.put(source.type(), source));
        this.preferences = preferences; this.currentUserProvider = currentUserProvider;
        this.rateLimitService = rateLimitService; this.meterRegistry = meterRegistry; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public SearchResponse search(String rawQuery, int requestedLimit) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        rateLimitService.checkSearch(actor.id());
        String query = validateQuery(rawQuery);
        int limit = Math.min(Math.max(requestedLimit, 1), 20);
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            int perSource = Math.min(5, limit);
            List<SearchEntry> entries = sources.values().stream()
                    .flatMap(source -> source.search(actor, query, perSource).stream())
                    .sorted(Comparator.comparingInt(SearchEntry::rank).reversed().thenComparing(SearchEntry::title))
                    .limit(limit).toList();
            var favorites = favoriteKeys(actor.id(), entries);
            if (entries.isEmpty()) meterRegistry.counter("gm.search.requests", "outcome", "zero").increment();
            else meterRegistry.counter("gm.search.requests", "outcome", "success").increment();
            return new SearchResponse(entries.stream().map(entry -> response(entry, favorites.contains(key(entry)))).toList(), limit);
        } catch (RuntimeException exception) {
            meterRegistry.counter("gm.search.requests", "outcome", "error").increment();
            throw exception;
        } finally {
            sample.stop(meterRegistry.timer("gm.search.duration"));
        }
    }

    @Transactional(readOnly = true)
    public List<SearchResultResponse> preferences(boolean favoritesOnly) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        List<SearchPreference> stored = favoritesOnly
                ? preferences.findByOwnerIdAndFavoriteTrueOrderByUpdatedAtDesc(actor.id(), PageRequest.of(0, 20))
                : preferences.findByOwnerIdOrderByLastAccessedAtDesc(actor.id(), PageRequest.of(0, 10));
        return stored.stream().map(item -> visible(actor, item)).flatMap(java.util.Optional::stream).toList();
    }

    @Transactional
    public SearchResultResponse remember(SearchPreferenceRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        SearchEntry visible = source(request.type()).findVisible(actor, request.id())
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Search result not found"));
        SearchPreference preference = preferences.findByOwnerIdAndResourceTypeAndResourceId(actor.id(), request.type(), request.id())
                .orElseGet(() -> new SearchPreference(actor.id(), request.type(), request.id(), clock.instant()));
        preference.setLastAccessedAt(clock.instant()); preference.setFavorite(request.favorite() || preference.isFavorite());
        preferences.save(preference);
        return response(visible, preference.isFavorite());
    }

    @Transactional
    public void removeFavorite(SearchResourceType type, UUID id) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        preferences.findByOwnerIdAndResourceTypeAndResourceId(actor.id(), type, id).ifPresent(preference -> {
            preference.setFavorite(false);
            preferences.save(preference);
        });
    }

    private java.util.Optional<SearchResultResponse> visible(AuthenticatedUser actor, SearchPreference preference) {
        return source(preference.getResourceType()).findVisible(actor, preference.getResourceId())
                .map(entry -> response(entry, preference.isFavorite()));
    }
    private SearchSource source(SearchResourceType type) {
        SearchSource source = sources.get(type);
        if (source == null) throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unsupported search resource");
        return source;
    }
    private String validateQuery(String raw) {
        String query = raw == null ? "" : raw.trim();
        if (query.length() < 2 || query.length() > 100 || query.chars().anyMatch(Character::isISOControl))
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Search query must contain 2 to 100 printable characters");
        return query;
    }
    private java.util.Set<String> favoriteKeys(UUID ownerId, List<SearchEntry> entries) {
        var result = new java.util.HashSet<String>();
        for (SearchResourceType type : SearchResourceType.values()) {
            List<UUID> ids = entries.stream().filter(entry -> entry.type() == type).map(SearchEntry::id).toList();
            if (!ids.isEmpty()) preferences.findByOwnerIdAndResourceTypeAndResourceIdIn(ownerId, type, ids).stream()
                    .filter(SearchPreference::isFavorite).forEach(item -> result.add(type + ":" + item.getResourceId()));
        }
        return result;
    }
    private String key(SearchEntry entry) { return entry.type() + ":" + entry.id(); }
    private SearchResultResponse response(SearchEntry entry, boolean favorite) {
        return new SearchResultResponse(entry.type(), entry.id(), entry.title(), entry.subtitle(), entry.url(),
                NavigationActionResponse.forResource(entry.type(), entry.url()), favorite);
    }
}
