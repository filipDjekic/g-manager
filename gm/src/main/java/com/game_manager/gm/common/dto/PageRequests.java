package com.game_manager.gm.common.dto;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/** Applies the same 100-row limit as the MVC pageable resolver. Sort fields are server-owned. */
public final class PageRequests {
    public static final int MAX_PAGE_SIZE = 100;
    private PageRequests() {}
    public static Pageable of(int page, int size, Sort sort) {
        return PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)), sort);
    }
    public static Pageable newest(int page, int size) {
        return of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
    }
}
