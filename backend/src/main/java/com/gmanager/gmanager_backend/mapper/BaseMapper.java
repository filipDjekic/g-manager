package com.gmanager.gmanager_backend.mapper;

public interface BaseMapper<E, D> {

    D toDto (E entity);

    E toEntity (D dto);
}
