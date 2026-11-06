# Životni ciklus gaming sesije

Jedini aktivni režim je `TIME_BALANCE`. Server vodi raspoloživo vreme u sekundama, a Client sprovodi potpisani rok pristupa. Nepotrošeno vreme ostaje na nalogu bez isteka.

## Stanja i prelazi

| Događaj | Rezultat |
| --- | --- |
| Ručno evidentirana uplata | Dodaje trajno vreme; ne pokreće sesiju. |
| Dodela računara | `WAITING_FOR_LOGIN`; ne troši vreme. |
| Potvrđena prijava dodeljenog korisnika na Client-u | Kreira `ACTIVE` sesiju i potpisani lease. |
| Dopuna dok sesija traje | Dodaje saldo i osvežava dozvoljeni kraj postojeće sesije. |
| Odjava ili završetak od strane osoblja | Obračunava potvrđene sekunde, prelazi u `TERMINATED` i šalje komandu zaključavanja. |
| Potrošen saldo ili granica pristupa | `EXPIRED`; nepotrošeno vreme, ako ga ima zbog granice radnog vremena/rezervacije, ostaje na nalogu. |
| Istek lease-a ili restart Client-a | Zatvara prethodni pristup i zahteva usaglašavanje/nove uslove prijave. |

Zajednički obračun `GamingTimeService` koriste lease obnova, periodični obračun i expiration job. Redosled zaključavanja je korisnik → stanica → sesija → račun. Jedinstvene aktivne sesije i ledger izvori sprečavaju duplu potrošnju. Client tajmer služi samo prikazu.

## API

- `POST /api/v1/gaming-billing/customers/{id}/time-grants`: najmanje 30 celih minuta, verzija cene, `CASH`/`EXTERNAL_POS`, opciona referenca; zahteva `GAMING_PAYMENT_RECORD` i `Idempotency-Key`.
- `POST /api/v1/gaming-billing/assignments` i `/assignments/{id}/cancel`: dodela i otkazivanje uz postojeća prava i resource scope.
- `POST /api/v1/machine/session-login`: station-bound machine autentikacija i lozinka dodeljenog registrovanog korisnika. Jedino ovo aktivira sesiju.
- `POST /api/v1/machine/session-logout`: završetak ili `CLIENT_RECOVERY`.
- `POST /api/v1/gaming-sessions/{id}/finish`: korisnik završava sopstvenu sesiju.
- `POST /api/v1/gaming-sessions/{id}/terminate`: osoblje sa `GAMING_SESSION_TERMINATE` završava sesiju uz razlog.
- `GET /api/v1/gaming-sessions`, `/{id}`, `/me/active`, `/customer/{id}/active`, `/me/history`, `/customer/{id}/history`: postojeći operativni i paginirani prikazi uz permission/resource scope provere.
- `/api/v1/gaming-sessions/stream`: postojeći SSE događaji.

Nema neposrednog web starta, tarifnog produženja, guest prijave ili kupovine paketa. V51 arhivira stare zapise; `HISTORICAL` je dozvoljen samo za terminalne stare sesije. Njihovi ID-jevi ostaju zbog istorije, audit-a i komandi.

## Audit i Client

Postojeći audit i outbox beleže dodelu, uplatu, aktivaciju, produženje i završetak. Pozitivni saldo ne zamenjuje machine identitet, lozinku, konfiguraciju ili potpisani lease. Zaključavanje zahteva stvarni Client protokol i potvrdu; migracija ne izmišlja lock ACK.

Detalji: [gaming vreme](../GAMING_TIME.md), [V51 i kompatibilnost](../operations/GAMING_BILLING_RETIREMENT.md).
