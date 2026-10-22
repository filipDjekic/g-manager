ALTER TABLE waitlist_entries
    MODIFY active_key VARCHAR(280) NULL,
    ADD COLUMN area_id CHAR(36) NULL,
    ADD COLUMN queue_entered_at TIMESTAMP(6) NULL,
    ADD COLUMN internal_note VARCHAR(500) NULL,
    ADD COLUMN created_by_id CHAR(36) NULL,
    ADD COLUMN consent_at TIMESTAMP(6) NULL,
    ADD COLUMN status_changed_at TIMESTAMP(6) NULL,
    ADD CONSTRAINT fk_waitlist_area FOREIGN KEY (area_id) REFERENCES areas(id),
    ADD CONSTRAINT fk_waitlist_creator FOREIGN KEY (created_by_id) REFERENCES users(id);
UPDATE waitlist_entries SET queue_entered_at=created_at, status_changed_at=updated_at;
ALTER TABLE waitlist_entries MODIFY queue_entered_at TIMESTAMP(6) NOT NULL;
CREATE INDEX idx_waitlist_fifo ON waitlist_entries(status,queue_entered_at,id);

CREATE TABLE waitlist_events (
    id CHAR(36) NOT NULL PRIMARY KEY,
    entry_id CHAR(36) NOT NULL,
    offer_id CHAR(36) NULL,
    event_type VARCHAR(40) NOT NULL,
    occurred_at TIMESTAMP(6) NOT NULL,
    actor_id CHAR(36) NULL,
    reason VARCHAR(500) NULL,
    CONSTRAINT fk_waitlist_event_entry FOREIGN KEY(entry_id) REFERENCES waitlist_entries(id),
    CONSTRAINT fk_waitlist_event_offer FOREIGN KEY(offer_id) REFERENCES waitlist_offers(id),
    CONSTRAINT fk_waitlist_event_actor FOREIGN KEY(actor_id) REFERENCES users(id)
);
CREATE INDEX idx_waitlist_event_timeline ON waitlist_events(entry_id,occurred_at,id);
-- Only timestamps that are known facts are backfilled; historical edits/expiry times are not inferred.
INSERT INTO waitlist_events(id,entry_id,event_type,occurred_at,actor_id)
SELECT UUID(),id,'ENTRY_CREATED',created_at,customer_id FROM waitlist_entries;
INSERT INTO waitlist_events(id,entry_id,offer_id,event_type,occurred_at)
SELECT UUID(),entry_id,id,'OFFER_CREATED',created_at FROM waitlist_offers;

INSERT INTO notification_templates(id,type,locale,title_template,body_template,created_at,updated_at,version)
VALUES(UUID(),'WAITLIST_CANCELLED','sr','Prijava na listu čekanja je otkazana',
    'Osoblje je otkazalo vašu prijavu. Detalje možete proveriti u svojim terminima.',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6),0);
