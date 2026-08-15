# Employee gaming operations workflow

Employee operativa koristi jednu stranicu `/gaming-sessions`. Board podatke dobija
iz `GET /api/v1/gaming-operations/board`; endpoint vraća samo stanice iz location
scope-a prijavljenog korisnika. Opcioni `locationId` se dodatno proverava na
backend-u i nije način za proširenje scope-a.

Svaki board response ima jedan `serverTime`. `remainingSeconds` je izveden na
backend-u iz aktivne sesije, a browser koristi monotoni timer samo za interpolaciju
između SSE događaja i periodičnog resync-a. Browser vreme nikada ne produžava
sesiju niti menja lifecycle stanje.

Operativni tok je:

1. Na `AVAILABLE` kartici zaposleni bira „Pokreni sesiju“.
2. U dijalogu pretražuje aktivnog customer korisnika, bira trajanje i potvrđuje
   idempotentnu start komandu.
3. `ACTIVE` kartica prikazuje customer ime, početak, kraj i countdown.
4. `+30`, `+60` ili prilagođeno produženje šalju aktuelnu session verziju i menjaju
   isti agregat. HTTP 409 zahteva refresh i ponovno potvrđivanje.
5. Ručni završetak zahteva razlog i idempotentnu terminate komandu.

Board može prikazati `AVAILABLE`, `ACTIVE`, `MAINTENANCE`, `RETIRED`, `OFFLINE`,
`EXPIRED` i `LOCK_PENDING`. Backend izračunava `allowedActions`; sakrivanje dugmeta
nije authorization kontrola, jer session servisi ponovo proveravaju permission,
location, zaključani agregat i verziju.

Session outbox događaji invalidiraju board query preko SSE-a. Periodični 30-sekundni
resync ostaje fallback za prekid SSE veze, tako da promena ne zahteva page reload.
