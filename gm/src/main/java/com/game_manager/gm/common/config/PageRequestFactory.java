package com.game_manager.gm.common.config;

import com.game_manager.gm.common.error.ApplicationException;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class PageRequestFactory {
    public PageRequest create(
            int page, int size, String sort, String direction, Set<String> allowedSorts) {
        if (page < 0) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Page must not be negative");
        }
        if (size < 1) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Size must be positive");
        }
        if (!allowedSorts.contains(sort)) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unsupported sort field");
        }
        Sort.Direction parsedDirection;
        try {
            parsedDirection = Sort.Direction.fromString(direction);
        } catch (IllegalArgumentException exception) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unsupported sort direction");
        }
        return PageRequest.of(page, Math.min(size, 100), Sort.by(parsedDirection, sort));
    }

    public PageRequest create(int page, int size, Sort sort) {
        if (page < 0 || size < 1) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Pagination is not valid");
        }
        return PageRequest.of(page, Math.min(size, 100), sort);
    }
}
