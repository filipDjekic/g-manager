package com.game_manager.gm.events;

import org.springframework.stereotype.Component;

@Component
public class ReceiptConsumer implements OutboxConsumer {
    @Override
    public String name() {
        return "event-receipt-v1";
    }

    @Override
    public void consume(OutboxMessage message) {
        // The durable receipt is the proof consumer's intentionally minimal side effect.
    }
}
