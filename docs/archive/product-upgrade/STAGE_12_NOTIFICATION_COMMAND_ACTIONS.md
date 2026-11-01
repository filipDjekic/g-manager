# Stage 12 - Notification and Command Palette entity actions


> **Istorijski dokument.** Sačuvan radi projektantskog konteksta i ranijih nalaza. Opisi, komande i rezultati u nastavku nisu potvrda trenutnog ponašanja niti važeće operativno uputstvo. Koristite [aktuelnu dokumentaciju](../../README.md) i [nalaze pregleda od 1. novembra 2026.](../../MAINTENANCE_AUDIT.md).

Search results and notification projections now carry a backend-owned `action` object with the stable `NAVIGATE` kind, a localized label and an authorized deep link. The frontend renders and executes this metadata; it does not derive privileged routes or action labels from entity types.

Search sources remain responsible for row-level visibility. Saved favorites and recent results are revalidated through the same source before an action is returned. Notification lists resolve their entity target for the current actor and omit the action when the target is deleted or no longer visible. Opening a notification calls `/api/v1/notifications/{id}/open`, which repeats the visibility check immediately before returning the action. A stale target therefore produces a controlled `404`, keeps the notification center open and presents a recoverable error.

The existing notification and search-preference schema is reused. No migration or new index was added because Stage 12 introduces no new query shape requiring measured database optimization.
