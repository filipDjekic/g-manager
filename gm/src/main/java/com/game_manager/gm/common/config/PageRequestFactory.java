package com.game_manager.gm.common.config;

import com.game_manager.gm.common.error.ApplicationException;
import java.util.Set;
import java.util.Arrays;
import java.util.List;
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
        List<String> fields = Arrays.stream(sort.split(",", -1)).map(String::trim).toList();
        List<String> directions = Arrays.stream(direction.split(",", -1)).map(String::trim).toList();
        if (fields.isEmpty() || fields.size() > 3 || fields.stream().anyMatch(String::isBlank)
                || fields.stream().distinct().count() != fields.size()
                || fields.stream().anyMatch(field -> !allowedSorts.contains(field))) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unsupported sort field");
        }
        if (directions.size() != 1 && directions.size() != fields.size()) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Sort directions must match sort fields");
        }
        try {
            Sort result = Sort.unsorted();
            for (int index = 0; index < fields.size(); index++) {
                String rawDirection = directions.get(directions.size() == 1 ? 0 : index);
                result = result.and(Sort.by(Sort.Direction.fromString(rawDirection), fields.get(index)));
            }
            return PageRequest.of(page, Math.min(size, 100), result);
        } catch (IllegalArgumentException exception) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Unsupported sort direction");
        }
    }

    public PageRequest create(int page, int size, Sort sort) {
        if (page < 0 || size < 1) {
            throw new ApplicationException(HttpStatus.BAD_REQUEST, "Pagination is not valid");
        }
        return PageRequest.of(page, Math.min(size, 100), sort);
    }
}
