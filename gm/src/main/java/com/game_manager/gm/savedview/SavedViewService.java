package com.game_manager.gm.savedview;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.common.security.AuthenticatedUser;
import com.game_manager.gm.common.security.CurrentUserProvider;
import com.game_manager.gm.savedview.dto.SavedViewRequest;
import com.game_manager.gm.savedview.dto.SavedViewResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SavedViewService {
    private final SavedViewRepository repository;
    private final CurrentUserProvider currentUserProvider;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<SavedViewResponse> list(SavedViewResourceType resourceType) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        return repository.findAllByOwnerIdAndResourceTypeOrderByName(actor.id(), resourceType)
                .stream().map(this::response).toList();
    }

    @Transactional
    public SavedViewResponse create(SavedViewRequest request) {
        AuthenticatedUser actor = currentUserProvider.requireCurrentUser();
        return response(repository.save(new SavedView(actor.id(), request.resourceType(),
                request.name().trim(), serialize(request.query()))));
    }

    @Transactional
    public SavedViewResponse update(UUID id, SavedViewRequest request) {
        SavedView view = owned(id);
        if (view.getResourceType() != request.resourceType()) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Saved view resource type cannot be changed");
        }
        if (request.version() == null || view.getVersion() != request.version()) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Saved view was changed by another request");
        }
        view.setName(request.name().trim());
        view.setQueryJson(serialize(request.query()));
        return response(repository.saveAndFlush(view));
    }

    @Transactional
    public void delete(UUID id, long version) {
        SavedView view = owned(id);
        if (view.getVersion() != version) {
            throw new ApplicationException(HttpStatus.CONFLICT, "Saved view was changed by another request");
        }
        repository.delete(view);
    }

    private SavedView owned(UUID id) {
        UUID ownerId = currentUserProvider.requireCurrentUser().id();
        return repository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND, "Saved view not found"));
    }

    private String serialize(Map<String, String> query) {
        try { return objectMapper.writeValueAsString(query); }
        catch (Exception exception) { throw new ApplicationException(HttpStatus.BAD_REQUEST, "Saved view query is invalid"); }
    }

    private SavedViewResponse response(SavedView view) {
        try {
            Map<String, String> query = objectMapper.readValue(view.getQueryJson(), new TypeReference<>() {});
            return new SavedViewResponse(view.getId(), view.getResourceType(), view.getName(), query, view.getVersion());
        } catch (Exception exception) {
            throw new IllegalStateException("Stored saved view query is invalid", exception);
        }
    }
}
