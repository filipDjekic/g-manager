# Stage 11 - Reservation lifecycle extension


> **Istorijski dokument.** Sačuvan radi projektantskog konteksta i ranijih nalaza. Opisi, komande i rezultati u nastavku nisu potvrda trenutnog ponašanja niti važeće operativno uputstvo. Koristite [aktuelnu dokumentaciju](../../README.md) i [nalaze pregleda od 1. novembra 2026.](../../MAINTENANCE_AUDIT.md).

`ReservationTransitionPolicy` je jedini izvor istine za graf statusa, role/ownership autorizaciju, vremenska ograničenja i obavezne razloge. `PENDING` može preći u `CONFIRMED`, `REJECTED` ili `CANCELLED`; `CONFIRMED` može preći u `COMPLETED` ili `CANCELLED`; završni statusi nemaju izlazne tranzicije. Employee može menjati samo dodeljene rezervacije, customer može otkazati samo sopstvenu, a management zadržava poslovne tranzicije.

Potvrđivanje prošlog termina, završavanje pre kraja i customer otkazivanje unutar konfigurisanog cutoff-a vraćaju `409`. `REJECTED` i `CANCELLED` zahtevaju razlog do 500 znakova i bez njega vraćaju `422`. Optimistic-lock verzija ostaje obavezna i zastarela verzija vraća `409`.

Detaljni i calendar DTO dobijaju `allowedActions` direktno iz iste policy klase koju koristi PATCH endpoint. Frontend prikazuje samo te akcije, zahteva razlog u dijalogu i kod konflikta osvežava detalj pre narednog pokušaja. Bulk i employee Today otkazivanje/odbijanje koriste isti obavezni reason tok.

Originalna booking napomena više se ne prepisuje lifecycle razlogom. Razlog i statusi pre/posle čuvaju se u postojećem append-only `audit_events` zapisu, a detaljni DTO izlaže samo sanitizovan poslovni timeline. Nova migration/history tabela nije potrebna jer postojeći audit poseduje vreme, status pre/posle i reason, uz postojeći indeks resursa.
