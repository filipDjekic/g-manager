# G-Manager — Idempotency & Optimistic Locking: Arhitektonska Implementacija

**Kontekst:** Ovo je poslednji deo arhitektonske specifikacije pre pisanja koda. Direktan ulaz za `idempotency` paket (Faza implementacije Reservation/Order modula) i `common/error` paket (`GlobalExceptionHandler`, Faza 7 — Cross-cutting Hardening).

---

## DEO 1 — Idempotency Flow

### 1.1 Gde se presreće: Servlet Filter, ne HandlerInterceptor

**Odluka:** `OncePerRequestFilter` (Spring), **ne** `HandlerInterceptor`.

**Razlog:** `HandlerInterceptor.preHandle()` izvršava se **nakon** što je `DispatcherServlet` već razrešio handler mapping, ali telo zahteva (`InputStream`) u tom trenutku po pravilu još nije pročitano od strane `HttpMessageConverter`-a — problem je što, ako želimo da **potpuno zaobiđemo** kontroler i servisni sloj na cache-hit (vratimo keširan odgovor bez ijednog poziva `ReservationService`/`OrderService`), moramo presresti **pre** nego što Spring MVC uopšte krene sa dispatch-om. Filter to omogućava; Interceptor ne može da spreči dolazak do kontrolera na potpuno čist način bez dodatnih zaobilaznica.

**Problem koji filter mora da reši — telo zahteva se čita samo jednom:** `HttpServletRequest.getInputStream()` je jednokratno čitljiv stream. Da bismo (a) pročitali telo radi računanja hash-a I (b) pustili da ga kasnije pročita `HttpMessageConverter` u kontroleru, moramo umotati request u `ContentCachingRequestWrapper` (Spring built-in) **pre** prosleđivanja dalje kroz `FilterChain`. Isto važi za response: `ContentCachingResponseWrapper` omogućava da posle izvršavanja pročitamo šta je kontroler vratio (da bismo to keširali), a zatim eksplicitno pozovemo `copyBodyToResponse()` da stvarni HTTP odgovor stigne klijentu (bez ovog poziva, response ostaje prazan — čest bug sa ovim wrapper-om).

### 1.2 Tačan redosled unutar filtera

```
IdempotencyFilter.doFilterInternal(request, response, chain):

    if NOT (request.method == POST AND path in {"/api/v1/reservations", "/api/v1/orders"}):
        chain.doFilter(request, response)   // filter se ne meša u ostale rute
        return

    key = request.getHeader("Idempotency-Key")
    if key is blank:
        response.setStatus(400)
        write ApiError("Idempotency-Key header je obavezan za ovu operaciju")
        return   // NE poziva se chain.doFilter — request se ovde zaustavlja

    wrappedRequest  = new ContentCachingRequestWrapper(request)
    wrappedResponse = new ContentCachingResponseWrapper(response)

    // Moramo pročitati telo PRE nego što saznamo da li ćemo ga uopšte koristiti,
    // jer ContentCachingRequestWrapper puni bafer tek kad se stream pročita.
    bodyBytes   = readFullyAndCache(wrappedRequest)   // forsira čitanje u keš
    requestHash = SHA256(bodyBytes)
    endpoint    = request.getMethod() + " " + request.getRequestURI()

    // ATOMARNI POKUŠAJ REZERVACIJE KLJUČA (vidi 1.4 za detalje race-condition zaštite)
    result = idempotencyService.tryReserveOrGetExisting(key, endpoint, requestHash)

    switch (result.outcome):

        case NEW_KEY_RESERVED:
            // Nastavljamo dalje kroz chain - kontroler/servis se stvarno izvršava
            chain.doFilter(wrappedRequest, wrappedResponse)
            idempotencyService.completeWithResponse(
                key, endpoint,
                wrappedResponse.getStatus(),
                wrappedResponse.getContentAsByteArray()
            )
            wrappedResponse.copyBodyToResponse()   // OBAVEZNO - inače klijent ne dobija ništa

        case DUPLICATE_SAME_HASH_COMPLETED:
            // Cache hit - vraćamo IDENTIČAN odgovor kao original, BEZ pozivanja chain.doFilter
            response.setStatus(result.cachedStatus)
            response.getWriter().write(result.cachedBody)
            // ReservationService/OrderService se NIKAD ne pozivaju za ovaj request

        case DUPLICATE_DIFFERENT_HASH:
            response.setStatus(409)
            write ApiError("Idempotency-Key je već upotrebljen sa drugačijim sadržajem zahteva")

        case DUPLICATE_IN_PROGRESS:
            response.setStatus(409)
            write ApiError("Zahtev sa ovim ključem je trenutno u obradi, pokušajte ponovo za par trenutaka")
```

### 1.3 Zašto 409, a ne 400, za konflikt različitog payload-a

Ovo namerno odstupa od intuicije "loš zahtev = 400". Po konvenciji uspostavljenoj u Funkcionalnoj Specifikaciji: **400** je rezervisan za **strukturno** nevalidne zahteve (nedostaje header, pogrešan tip polja). Ponovna upotreba istog `Idempotency-Key`-a sa drugačijim telom **nije** strukturalni problem samog zahteva posmatranog izolovano — zahtev je sam po sebi validan. Problem je što **već postoji zapamćeno stanje** (prethodni zahtev sa istim ključem) sa kojim je ovaj u konfliktu — to je po definiciji **409 Conflict**, isti obrazac kao i za state-machine i optimistic-locking konflikte (Deo 2 ovog dokumenta). Ovo daje frontend-u **jedan jedinstven handler** za sve "409 → osveži/pokušaj ponovo drugačije" scenarije u celom sistemu.

### 1.4 IdempotencyKey entitet i atomarnost preko unique constraint-a

**Šema tabele:**
```sql
CREATE TABLE idempotency_key (
    id              CHAR(36)      NOT NULL PRIMARY KEY,
    idempotency_key VARCHAR(255)  NOT NULL,
    endpoint        VARCHAR(255)  NOT NULL,
    request_hash    CHAR(64)      NOT NULL,      -- SHA-256 hex, uvek fiksne dužine
    status          VARCHAR(20)   NOT NULL,      -- IN_PROGRESS | COMPLETED
    response_status INT           NULL,
    response_body   LONGTEXT      NULL,
    created_at      DATETIME(6)   NOT NULL,
    expires_at      DATETIME(6)   NOT NULL,

    UNIQUE KEY uq_key_endpoint (idempotency_key, endpoint),
    INDEX idx_expires_at (expires_at)
);
```

**Zašto je `tryReserveOrGetExisting` opisan kao "atomarni pokušaj rezervacije", a ne prost `SELECT` pa `INSERT`:** Dva konkurentna zahteva sa **istim, potpuno novim** ključem mogu stići u praktično istom trenutku — klasičan check-then-act race. Ako bismo prvo radili `SELECT` (ne postoji) pa onda `INSERT`, oba zahteva bi mogla proći `SELECT` proveru pre nego što ijedan izvrši `INSERT`, i oba bi pokrenula punu poslovnu logiku (dupliranje rezervacije/narudžbine — tačno ono što ovaj mehanizam treba da spreči).

**Rešenje:** Osloniti se na `UNIQUE KEY uq_key_endpoint` kao na jedini izvor istine za atomarnost:
1. Servis **odmah** pokušava `INSERT` reda sa `status = IN_PROGRESS` (bez prethodnog `SELECT`-a).
2. Ako `INSERT` uspe → ovaj zahtev je "pobednik", nastavlja se izvršavanje poslovne logike (`NEW_KEY_RESERVED`).
3. Ako `INSERT` baci `DataIntegrityViolationException` (MySQL duplicate key na unique constraint) → red već postoji (bilo od ranije završenog zahteva, bilo od **konkurentnog** zahteva koji je stigao milisekundu ranije). Servis tada radi `SELECT` postojećeg reda i grana se:
   - `status == COMPLETED` i `request_hash` se poklapa → `DUPLICATE_SAME_HASH_COMPLETED`.
   - `status == COMPLETED` i `request_hash` se **ne** poklapa → `DUPLICATE_DIFFERENT_HASH`.
   - `status == IN_PROGRESS` (konkurentni zahtev je još u letu, nije stigao do `completeWithResponse`) → `DUPLICATE_IN_PROGRESS`.

Ovim je baza (unique constraint), a ne aplikativni kod, garant atomarnosti — jedini ispravan pristup kad postoji više instanci aplikacije iza load balancer-a (aplikativni `synchronized`/lokalni lock ne bi radio kroz više JVM instanci).

**Šta ako poslovna logika baci izuzetak (npr. 409 zbog preklapanja termina) nakon što je `IN_PROGRESS` red već upisan:** Red se mora ili obrisati, ili prevesti u posebno `FAILED` stanje (i tretirati kao "kao da ne postoji" pri sledećem pokušaju), u `catch`/`finally` bloku oko poziva `chain.doFilter()`. U suprotnom, legitiman neuspeh (npr. korisnik je pogrešio pa dobio 409, i želi da ispravi zahtev i pošalje ponovo **isti** `Idempotency-Key`) bi ostao trajno blokiran kao "already in progress". Preporuka: `DELETE` reda pri neuspehu je jednostavnije od uvođenja trećeg statusa.

### 1.5 TTL i sprečavanje rasta tabele

- `expires_at = createdAt + 24h` (konfigurabilno: `gmanager.idempotency.ttl-hours`, default 24).
- `@Scheduled` job (npr. `@Scheduled(cron = "0 0 3 * * *")` — svakog dana u 03:00) izvršava:
  ```sql
  DELETE FROM idempotency_key WHERE expires_at < NOW();
  ```
- Indeks `idx_expires_at` čini ovaj `DELETE` efikasnim (range scan, ne full table scan) čak i kad tabela naraste na milione istorijskih zapisa.
- **Napomena:** Ako klijent pošalje isti `Idempotency-Key` **posle** isteka TTL-a, tretira se kao potpuno nov ključ (prethodni red je uklonjen) — ovo je prihvatljivo, jer je 24h daleko duže od bilo kog realnog retry-scenarija (mrežni timeout, refresh dugme).

---

## DEO 2 — Optimistic Locking: Globalno Rukovanje Izuzetkom

### 2.1 Koji izuzetak se hvata

Kada Hibernate detektuje da se `version` kolona promenila između čitanja i pisanja entiteta (`Order`, `Reservation`), baca **`jakarta.persistence.OptimisticLockException`** na nivou JPA provajdera. Pošto naši repozitorijumi idu kroz Spring Data JPA (`JpaRepository`), Spring-ov `PersistenceExceptionTranslationPostProcessor` automatski prevodi ovo u **`org.springframework.orm.ObjectOptimisticLockingFailureException`** (podtip `ObjectOptimisticLockingFailureException extends OptimisticLockingFailureException extends DataAccessException`) — **ovo je izuzetak koji hvatamo u `GlobalExceptionHandler`-u**, ne "sirovi" JPA izuzetak, jer je Spring-ov prevedeni oblik ono što stvarno izlazi iz repository poziva.

**Kada tačno izuzetak "puca":** Ne nužno na liniji `repository.save(entity)` — Hibernate po pravilu odlaže fizički `UPDATE` do trenutka `flush()`-a (eksplicitnog ili implicitnog, na kraju `@Transactional` metode). To znači da se izuzetak može pojaviti i **posle** poziva `save()`, u trenutku kad se transakcija zatvara — bitno je da `GlobalExceptionHandler` hvata izuzetak nezavisno od tačne linije porekla, jer se on kao unchecked exception propagira uz poziv-stek sve do granice kontrolera.

### 2.2 Handler implementacija (koncept)

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiError> handleOptimisticLock(
            ObjectOptimisticLockingFailureException ex,
            HttpServletRequest request) {

        ApiError body = ApiError.builder()
            .timestamp(Instant.now())
            .status(409)
            .error("Conflict")
            .message("Podaci su u međuvremenu izmenjeni od strane drugog korisnika. "
                   + "Molimo osvežite podatke i pokušajte ponovo.")
            .path(request.getRequestURI())
            .requestId(MDC.get("requestId"))
            .build();

        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }
}
```

**Tačan HTTP status:** `409 Conflict` — nikad 400 ni 500. Ovo je isti obrazac kao Deo 1.3: zahtev je strukturno ispravan, problem je isključivo u **trenutnom stanju resursa** koje se promenilo od trenutka kad je klijent poslednji put pročitao podatke.

**Tačna poruka (predlog, standardizovan tekst za sve entitete koji koriste `@Version`):**
> "Podaci su u međuvremenu izmenjeni od strane drugog korisnika. Molimo osvežite podatke i pokušajte ponovo."

Namerno **generička** poruka (ne "Order je izmenjen" vs "Reservation je izmenjen" posebno) — jedan handler pokriva oba entiteta, frontend prikazuje istu vrstu UI upozorenja bez obzira na modul.

### 2.3 Posledice po transakciju nakon izuzetka

Kada `OptimisticLockException`/`ObjectOptimisticLockingFailureException` bude bačen, **JPA `EntityManager` i tekuća transakcija se smatraju nevažećim** (transakcija je markirana za rollback) — nije moguće nastaviti sa istim entitetom u istom kontekstu. `GlobalExceptionHandler` ne pokušava interni retry — vraća 409 direktno klijentu i **klijent** je taj koji inicira ponovni pokušaj (novi HTTP request, sa svežim GET-om podataka pre eventualnog ponovnog PATCH-a). Ovo je namerna arhitektonska odluka: tihi backend-retry bi mogao da primeni izmenu korisnika nad podacima koje korisnik nije ni video (npr. narudžbina koju je preuzeo drugi zaposleni dok je prvi čekao retry) — eksplicitan povratak klijentu je bezbedniji.

### 2.4 Frontend ugovor (podsetnik iz ranije specifikacije)

Pošto i Idempotency-Key konflikt (Deo 1.3) i Optimistic Locking konflikt (Deo 2.2) vraćaju identičan `ApiError` oblik sa `status: 409`, frontend `ErrorBanner`/globalni error handler (definisan u Faza 7/8 strukturi) tretira **sve 409 odgovore uniformno**: prikazuje poruku iz `message` polja i nudi "Osveži i pokušaj ponovo" akciju koja ponovo učitava trenutno stanje resursa sa servera — nema potrebe za posebnim granama u frontend kodu po tipu 409 greške.

---

## Rekapitulacija — Šta se implementira u kojoj fazi

| Komponenta | Modul/paket | Faza |
|---|---|---|
| `IdempotencyFilter` (`OncePerRequestFilter`) | `idempotency` | Faza 4/5 (uvodi se zajedno sa Reservation/Order servisima koji ga koriste) |
| `IdempotencyKey` entitet + repository | `idempotency` | Faza 4/5 |
| `@Scheduled` cleanup job | `idempotency` | Faza 4/5 (ili odloženo do Faze 7 ako se prioritizuje) |
| `ObjectOptimisticLockingFailureException` handler | `common/error` (`GlobalExceptionHandler`) | Faza 7 — Cross-cutting Hardening (ali se testira već od Faze 5, čim `Order.@Version` postoji) |

Ovim je arhitektonska specifikacija G-Manager sistema u potpunosti zatvorena — svih 6 dokumenata (Engineering Plan, Domenski Model, State Machine, UTC/WorkingHours, Funkcionalna Specifikacija, Idempotency/Optimistic Locking) čine kompletan, međusobno konzistentan referentni set spreman za Fazu implementacije.
