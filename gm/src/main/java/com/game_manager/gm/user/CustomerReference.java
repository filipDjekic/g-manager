package com.game_manager.gm.user;

import java.time.Instant;
import java.util.UUID;

public record CustomerReference(
        UUID id, String name, String email, boolean active, Instant createdAt, long version) {}
