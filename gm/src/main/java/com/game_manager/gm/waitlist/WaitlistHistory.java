package com.game_manager.gm.waitlist;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor
public class WaitlistHistory {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public record Event(UUID id, String type, Instant occurredAt, UUID actorId, String actorName,
            UUID offerId, String reason) {}
    void record(WaitlistEntry entry, String type, UUID actor, UUID offer, String reason) {
        jdbc.update("INSERT INTO waitlist_events(id,entry_id,event_type,occurred_at,actor_id,offer_id,reason) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), entry.getId().toString(), type, Timestamp.from(clock.instant()),
                actor==null?null:actor.toString(), offer==null?null:offer.toString(), reason);
    }
    List<Event> list(UUID entry) {
        return jdbc.query("SELECT e.*,u.name actor_name FROM waitlist_events e LEFT JOIN users u ON u.id=e.actor_id "
                + "WHERE e.entry_id=? ORDER BY e.occurred_at DESC,e.id DESC", (row,index) -> new Event(
                    UUID.fromString(row.getString("id")),row.getString("event_type"),row.getTimestamp("occurred_at").toInstant(),
                    uuid(row.getString("actor_id")),row.getString("actor_name"),uuid(row.getString("offer_id")),row.getString("reason")),entry.toString());
    }
    private static UUID uuid(String value) { return value==null?null:UUID.fromString(value); }
}
