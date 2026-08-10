package com.game_manager.gm.events;

public interface OutboxConsumer {
    String name();

    void consume(OutboxMessage message);
}
