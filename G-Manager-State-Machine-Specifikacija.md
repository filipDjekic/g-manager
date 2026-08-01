# G-Manager — State Machine & Authorization Specifikacija
## (Reservation & Order statusne mašine)

**Kontekst:** Nastavak na Domenski Model. Ova specifikacija je direktan ulaz za implementaciju `ReservationService.changeStatus()` i `OrderService.changeStatus()` — svaka tranzicija ispod treba da postane jedna grana (`if`/`switch`/strategy mapa) u servisnom sloju, sa identičnim redosledom provera.

**Opšta konvencija za oba modula:**
1. Promena statusa se **nikad** ne radi generičkim `PUT /update` — postoji dedikovan endpoint (`PATCH /{id}/status`) koji prima **samo** ciljni status, ne ceo objekat.
2. Svaka tranzicija prolazi kroz 3 sloja provere, tim redosledom:
   a) **Autorizacija** (da li rola/vlasništvo dozvoljava ovu akciju) → 403 ako ne.
   b) **Validnost tranzicije** (da li je `trenutni status → ciljni status` uopšte dozvoljena grana u mašini) → 409 ako ne.
   c) **Biznis preduslovi** (vreme, vlasništvo nad resursom, itd.) → 409 ili 400 zavisno od prirode.
3. `@Version` optimističko zaključavanje se proverava na nivou transakcije (Hibernate automatski) — konkurentna promena statusa od dva aktera vraća 409 **pre** nego što se ijedna od gornjih poslovnih provera uopšte razmatra za drugi request (Hibernate baca `OptimisticLockException` na `flush`).
4. Svaka uspešna tranzicija ažurira `updatedAt` (automatski kroz `BaseEntity`/`@PreUpdate`) — ovo služi kao jednostavan audit trag "kada je poslednja promena statusa desila".

---

## DEO 1 — ReservationStatus

### 1.1 Dijagram tranzicija

```
                 ┌───────────┐
                 │  PENDING  │  (initial state)
                 └─────┬─────┘
            ┌──────────┼──────────┐
            ▼          ▼          ▼
      ┌───────────┐ ┌────────┐ ┌───────────┐
      │ CONFIRMED │ │REJECTED│ │ CANCELLED │
      └─────┬─────┘ └────────┘ └───────────┘
            │           (terminal)  (terminal)
      ┌─────┼─────┐
      ▼           ▼
┌───────────┐ ┌───────────┐
│ COMPLETED │ │ CANCELLED │
└───────────┘ └───────────┘
 (terminal)     (terminal)
```

**Terminalna stanja (bez izlaznih tranzicija):** `REJECTED`, `CANCELLED`, `COMPLETED`.
**Nonterminalna (imaju izlazne grane):** `PENDING`, `CONFIRMED`.

### 1.2 Tabela dozvoljenih tranzicija, autorizacije i pravila

| Od → Ka | Dozvoljene role | Vlasnički uslov | Biznis preduslovi (backend provera) |
|---|---|---|---|
| `PENDING → CONFIRMED` | EMPLOYEE, ADMIN, OWNER | EMPLOYEE sme samo ako je `employeeId == currentUser.id` (ADMIN/OWNER bez ograničenja) | Ponovo proveriti preklapanje termina (`findConflicting`) — moguće da je u međuvremenu drugi termin potvrđen za istog zaposlenog dok je ovaj bio PENDING; `startTime` i dalje mora biti u budućnosti. |
| `PENDING → REJECTED` | EMPLOYEE, ADMIN, OWNER | Isto kao gore | Opciono: obavezno popuniti `note` sa razlogom odbijanja (servisna validacija ako se zahteva razlog). |
| `PENDING → CANCELLED` | CUSTOMER (vlasnik), ADMIN, OWNER | CUSTOMER sme samo ako je `customerId == currentUser.id` | Nema dodatnih vremenskih provera — otkazivanje PENDING termina je uvek dozvoljeno (još nije ni potvrđen). |
| `CONFIRMED → COMPLETED` | EMPLOYEE, ADMIN, OWNER | EMPLOYEE sme samo ako je `employeeId == currentUser.id` | **Obavezno:** `Instant.now() >= endTime` — termin se ne može označiti kao završen pre nego što je usluga (po vremenu) zaista i mogla da se odradi. Ako `now() < endTime` → 409/422 ("termin još nije istekao"). |
| `CONFIRMED → CANCELLED` | CUSTOMER (vlasnik), EMPLOYEE, ADMIN, OWNER | CUSTOMER sme samo ako je `customerId == currentUser.id` | **Preporučeno pravilo:** otkazivanje potvrđenog termina dozvoljeno samo ako `Instant.now() < startTime - cancellationCutoff` (npr. minimum 1h pre termina — konfigurabilna vrednost). Ako je unutar cutoff prozora → 409 ("prekasno za otkazivanje"), sem ako akciju izvršava EMPLOYEE/ADMIN/OWNER (interno otkazivanje nema cutoff ograničenje). |
| `CONFIRMED → REJECTED` | **NIJE DOZVOLJENO** | — | Jednom potvrđen termin se više ne "odbija" — jedina dalja negativna akcija je `CANCELLED`. Ovo namerno suzuje broj grana i sprečava dvosmislenost između REJECTED (nikad prihvaćeno) i CANCELLED (prihvaćeno pa otkazano). |

### 1.3 Sažetak autorizacione matrice (Reservation)

| Akcija | OWNER | ADMIN | EMPLOYEE (vlasnik termina) | CUSTOMER (vlasnik termina) |
|---|---|---|---|---|
| Potvrdi (`CONFIRMED`) | ✅ | ✅ | ✅ | ❌ |
| Odbij (`REJECTED`) | ✅ | ✅ | ✅ | ❌ |
| Otkaži dok je `PENDING` | ✅ | ✅ | ❌* | ✅ |
| Otkaži dok je `CONFIRMED` | ✅ (bez cutoff-a) | ✅ (bez cutoff-a) | ❌* | ✅ (sa cutoff pravilom) |
| Označi kao `COMPLETED` | ✅ | ✅ | ✅ | ❌ |

*EMPLOYEE tehnički nije predviđen u dokumentu da otkazuje (to je uloga CUSTOMER-a ili menadžmenta); ako se ipak želi dozvoliti EMPLOYEE da otkaže termin (npr. zbog bolesti), to je svesno proširenje van osnovne specifikacije i treba ga eksplicitno odobriti pre implementacije.

---

## DEO 2 — OrderStatus

### 2.1 Dijagram tranzicija

```
                ┌─────────┐
                │ CREATED │  (initial state)
                └────┬────┘
           ┌─────────┼─────────┐
           ▼                   ▼
     ┌────────────┐      ┌───────────┐
     │IN_PROGRESS │      │ CANCELLED │
     └──────┬─────┘      └───────────┘
            │              (terminal)
      ┌─────┼─────┐
      ▼           ▼
  ┌───────┐  ┌───────────┐
  │ READY │  │ CANCELLED │
  └───┬───┘  └───────────┘
      │        (terminal)
┌─────┼─────┐
▼           ▼
┌───────────┐  ┌───────────┐
│ COMPLETED │  │ CANCELLED │  ← (samo ADMIN/OWNER, izuzetak — vidi 2.2)
└───────────┘  └───────────┘
 (terminal)      (terminal)
```

**Terminalna stanja:** `COMPLETED`, `CANCELLED`.
**Nonterminalna:** `CREATED`, `IN_PROGRESS`, `READY`.

### 2.2 Tabela dozvoljenih tranzicija, autorizacije i pravila

| Od → Ka | Dozvoljene role | Vlasnički uslov | Biznis preduslovi (backend provera) |
|---|---|---|---|
| `CREATED → IN_PROGRESS` | EMPLOYEE, ADMIN, OWNER | — (bilo koji EMPLOYEE može preuzeti narudžbinu) | Postavlja `handledBy = currentUser.id` **atomarno** unutar iste transakcije kao promena statusa. Ako dva zaposlena istovremeno pokušaju preuzimanje → `@Version` optimistic lock hvata drugi request i vraća 409 ("narudžbina je već preuzeta"). |
| `CREATED → CANCELLED` | CUSTOMER (vlasnik), EMPLOYEE, ADMIN, OWNER | CUSTOMER sme samo ako je `customerId == currentUser.id` | Nema vremenskog ograničenja — narudžbina koja još nije ušla u obradu se uvek može otkazati. |
| `IN_PROGRESS → READY` | EMPLOYEE (samo onaj koji je u `handledBy`), ADMIN, OWNER | EMPLOYEE mora biti `handledBy == currentUser.id` (ADMIN/OWNER override) | Nema dodatnih vremenskih provera; čisto operativni prelaz ("roba je spakovana/spremna za preuzimanje"). |
| `IN_PROGRESS → CANCELLED` | EMPLOYEE (handledBy), ADMIN, OWNER | Isto kao gore | **CUSTOMER više NE SME da otkaže** narudžbinu koja je već u obradi (sprečava rasipanje već pripremljene robe) — ovo je namerna razlika u odnosu na `CREATED` stanje. |
| `READY → COMPLETED` | EMPLOYEE (handledBy), ADMIN, OWNER | Isto kao gore | Predstavlja fizičko preuzimanje (pickup) od strane kupca — potvrđuje ga zaposleni na licu mesta. Nema dodatne vremenske provere. |
| `READY → CANCELLED` | **SAMO ADMIN, OWNER** (ne EMPLOYEE, ne CUSTOMER) | — | Rezervni/izuzetni slučaj (npr. kupac se nikad nije pojavio po robu — "no-show" politika). Namerno ograničeno na management nivo jer je roba već spremna i otkazivanje u ovoj fazi ima veće poslovne implikacije (vraćanje na zalihu, gubitak, itd. — van MVP scope-a, ali tranzicija mora postojati da stanje ne bude "zaglavljeno"). |

### 2.3 Sažetak autorizacione matrice (Order)

| Akcija | OWNER | ADMIN | EMPLOYEE (handledBy) | CUSTOMER (vlasnik) |
|---|---|---|---|---|
| Preuzmi narudžbinu (`IN_PROGRESS`) | ✅ | ✅ | ✅ (bilo koji) | ❌ |
| Označi `READY` | ✅ | ✅ | ✅ (samo handler) | ❌ |
| Označi `COMPLETED` | ✅ | ✅ | ✅ (samo handler) | ❌ |
| Otkaži dok je `CREATED` | ✅ | ✅ | ✅ | ✅ |
| Otkaži dok je `IN_PROGRESS` | ✅ | ✅ | ✅ (samo handler) | ❌ |
| Otkaži dok je `READY` | ✅ | ✅ | ❌ | ❌ |

---

## DEO 3 — Zajednička implementaciona pravila (za oba servisa)

### 3.1 Struktura provere (pseudo-redosled u servisu)

```
changeStatus(id, targetStatus, currentUser):
    entity = repository.findById(id) ili 404
    validateTransitionExists(entity.status, targetStatus)      // 409 ako grana ne postoji u mapi
    validateAuthorization(currentUser, entity, targetStatus)   // 403 ako rola/vlasništvo ne odgovara
    validateBusinessPreconditions(entity, targetStatus)        // 400/409 zavisno od pravila iz tabela 1.2 / 2.2
    entity.status = targetStatus
    applySideEffects(entity, targetStatus)   // npr. handledBy = currentUser.id
    repository.save(entity)                  // Hibernate proverava @Version ovde -> moguć 409
```

### 3.2 Preporučena reprezentacija mašine u kodu

Umesto raspršenih `if/else` grana, preporuka je definisati **eksplicitnu mapu dozvoljenih tranzicija** kao statičku strukturu (npr. `Map<Status, Set<Status>>`) na početku `ReservationService`/`OrderService`, tako da:
- Provera `validateTransitionExists` postane jedan generički lookup, nezavisno od role/preduslova.
- Autorizacija i biznis pravila se implementiraju kao **zasebne, imenovane metode po tranziciji** (npr. `assertCanConfirm()`, `assertCanCompleteReservation()`), radi čitljivosti i testabilnosti (svaka metoda = jedan unit test).

### 3.3 Greške i mapiranje na HTTP status (u skladu sa sekcijom 8/17 specifikacije)

| Situacija | HTTP status |
|---|---|
| Tranzicija ne postoji u mapi (npr. `COMPLETED → PENDING`) | `409 Conflict` |
| Rola/vlasništvo ne dozvoljava akciju | `403 Forbidden` |
| Biznis preduslov nije ispunjen (npr. `now() < endTime`, cutoff prozor) | `409 Conflict` (stanje sistema trenutno ne dozvoljava, ne greška u zahtevu) |
| Konkurentna izmena (`@Version` mismatch) | `409 Conflict` |
| Entitet ne postoji | `404 Not Found` |

**Napomena:** Namerno se **ne koristi 400 Bad Request** za neuspele tranzicije — 400 je rezervisan za strukturno neispravne zahteve (npr. nedostaje `targetStatus` polje). Nevalidna tranzicija ili nezadovoljen preduslov je uvek **409**, jer je zahtev strukturno ispravan, ali trenutno stanje resursa ga ne dozvoljava — ovo je konzistentno sa upotrebom 409 kod optimističkog zaključavanja, pa frontend može imati **jedinstven handler** za sve "stanje se promenilo / pokušaj ponovo" scenarije.

### 3.4 Otvorena pitanja za tim (potrebna eksplicitna odluka pre implementacije)

1. **Cancellation cutoff za Reservation** (`CONFIRMED → CANCELLED` od strane CUSTOMER-a) — koja je tačna vrednost prozora (30 min? 1h? 24h?)? Predlog: konfigurabilno u `application.yml` (`reservation.cancellation-cutoff-minutes`), ne hardkodovano.
2. **Da li EMPLOYEE sme da otkazuje rezervacije** (van dokumentovanog opsega, pomenuto u 1.3 fusnoti) — treba eksplicitna odluka da li se ovo dodaje kao prošireno pravilo.
3. **`READY → CANCELLED` posledice po zalihe/finansije** — trenutno samo menja status; ako se u budućnosti uvede koncept zaliha ili refundacije (post-MVP, sekcija 28), ova tranzicija će verovatno pokretati dodatne side-effect-e koje sada ne modelujemo.
