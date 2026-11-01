# Stage 13 - Unified management list patterns


> **Istorijski dokument.** Sačuvan radi projektantskog konteksta i ranijih nalaza. Opisi, komande i rezultati u nastavku nisu potvrda trenutnog ponašanja niti važeće operativno uputstvo. Koristite [aktuelnu dokumentaciju](../../README.md) i [nalaze pregleda od 1. novembra 2026.](../../MAINTENANCE_AUDIT.md).

Management lists reuse `useListUrlState` for allow-listed URL restoration, `SavedViewBar` for private versioned views, `SelectionBar` for bulk actions, the shared page response contract and per-item bulk outcomes. Customers now participate in the same saved-view contract as catalog, users, reservations and orders.

Table-based user and customer lists expose mobile card labels through `data-label` and the shared `responsive-table` style. Existing catalog, order and reservation management views already use cards. Row details continue to use the shared drawer, including focus trapping, Escape close and focus restoration to the opener.

No migration is required: `saved_views.resource_type` is a bounded string column and already has the owner/resource index. Specialized lifecycle actions remain in their existing pages and services; Stage 13 changes only shared list mechanics.
