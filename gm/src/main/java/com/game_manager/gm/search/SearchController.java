package com.game_manager.gm.search;

import com.game_manager.gm.common.search.SearchResourceType;
import com.game_manager.gm.search.dto.SearchPreferenceRequest;
import com.game_manager.gm.search.dto.SearchResponse;
import com.game_manager.gm.search.dto.SearchResultResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/search")
@RequiredArgsConstructor
public class SearchController {
    private final SearchService service;

    @GetMapping
    public SearchResponse search(@RequestParam String q, @RequestParam(defaultValue = "20") int limit) {
        return service.search(q, limit);
    }
    @GetMapping("/preferences")
    public List<SearchResultResponse> preferences(@RequestParam(defaultValue = "false") boolean favoritesOnly) {
        return service.preferences(favoritesOnly);
    }
    @PostMapping("/preferences")
    public SearchResultResponse remember(@Valid @RequestBody SearchPreferenceRequest request) {
        return service.remember(request);
    }
    @DeleteMapping("/preferences")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFavorite(@RequestParam SearchResourceType type, @RequestParam UUID id) {
        service.removeFavorite(type, id);
    }
}
