package com.game_manager.gm.savedview;

import com.game_manager.gm.savedview.dto.SavedViewRequest;
import com.game_manager.gm.savedview.dto.SavedViewResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/saved-views")
@RequiredArgsConstructor
public class SavedViewController {
    private final SavedViewService service;

    @GetMapping
    public List<SavedViewResponse> list(@RequestParam SavedViewResourceType resourceType) {
        return service.list(resourceType);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SavedViewResponse create(@Valid @RequestBody SavedViewRequest request) { return service.create(request); }

    @PatchMapping("/{id}")
    public SavedViewResponse update(@PathVariable UUID id, @Valid @RequestBody SavedViewRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @RequestParam long version) { service.delete(id, version); }
}
