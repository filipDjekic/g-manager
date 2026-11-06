# API struktura i ugovori

Poslovni REST API je pod `/api/v1`. Izvor ugovora su kontroleri u [backend paketima](../../gm/src/main/java/com/game_manager/gm), njihovi DTO-i i service provere. [Frontend API moduli](../../frontend/g-manager/src/api) pokazuju stvarne pozive web aplikacije. Ovo je mapa API-ja i zajedničkih pravila, ne zamena za sve request/response šeme.

## Pregled ruta

Putanje u tabeli su relativne na `/api/v1`, osim kada je navedeno drugačije. `{id}` označava identifikator iz odgovora, uglavnom UUID.

| Grupa | Postojeće operacije |
| --- | --- |
| `/auth` | `GET /csrf`; `POST /login`, `/activate`, `/refresh`, `/logout`; `GET /sessions`, `/security-events`; `DELETE /sessions` i `/sessions/{id}`; `/register` je legacy POST koji vraća 403 |
| `/users` | `GET/PATCH /me`, `PATCH /me/password`, `POST /me/avatar`; `GET/POST` kolekcija, employee pregledi/statistike/dodele, `PATCH /{id}/deactivate`, delete/restore, deleted/statistics/detail i bulk deactivate |
| `/customers` | `GET/POST` kolekcija, `GET/PATCH /{id}`, `POST /{id}/deactivate`, `GET /statistics`; `/{customerId}/crm` sa notes/tags operacijama |
| `/catalog` | Lista, detalj, statistics, create/update/activate/deactivate, multipart image, delete/restore i bulk activation |
| `/working-hours` | Čitanje nedelje, `PUT /{dayOfWeek}`, exceptions list/create/update/delete |
| `/time-off` | `GET/POST`, `PATCH /{id}/status` |
| `/availability` | `GET` termini i `GET /overview` |
| `/resources` | Lokacije, zone, fizički resursi, booking options, availability mape, service filteri, management scope, employee dodele; `locations/{locationId}/floor-plan` GET/PUT |
| `/reservations` | Create, own/management liste i summary, booking-plan, calendar-context/calendar, detail/edit, resource options/assignment, status i bulk status; `POST /recurrence/preview`, `/recurrence` |
| `/waitlist` | Own lista/join/cancel i offer accept; management list/statistics/scope/detail/create/update/delete |
| `/orders` | CUSTOMER create i `/me` lista/detalj; management lista/statistics/detalj; `PATCH /{id}/status` i `/bulk/status` |
| `/dashboard` | summary, today, attention, trends, workload, CSV export, GET/PUT widget-preferences |
| `/search`, `/saved-views` | Permission filtrirana pretraga i preferences; saved view list/create/update/delete |
| `/audit-events` | Lista, statistics i detalj, uz audit visibility proveru |
| `/notifications` | Lista, read/read-all, open, GET/PUT preferences i SSE `/stream` |
| `/documents` | Multipart upload/list, `POST /{id}/versions`, `GET /{id}/content`, delete/restore |
| `/reports` | definitions, create/list/detail/cancel/download, schedules i templates |
| `/features` | `GET /bootstrap`, management lista, `PATCH /{flag}` |
| `/ai` | `POST /report-summaries/{reportId}`, `POST /usage/{usageId}/feedback`; AI flag, consent, report vlasništvo i limiti |
| `/stations` | Lista/client-status, profile, application definitions i application-profiles CRUD; `client-package` metadata/availability/download |
| `/stations/{stationId}/machine-identity` | Lista, enrollment-token, rotation-token i revoke |
| `/gaming-sessions` | Detail/list, `/me`, `/customer/{customerId}`, finish/terminate i SSE `/stream` |
| `/gaming-billing` | `GET/PUT /time-price`; `GET /customers/{id}/time`, istorija vremena/uplata; `POST /customers/{id}/time-grants`, `/assignments`, `/assignments/{id}/cancel`; finansijski izveštaji |
| `/gaming-operations` | `GET /board`, station history, `POST /stations/{stationId}/force-lock` i `/confirm-locked` |
| `/machine` | enroll, auth/challenge, auth/token; heartbeat, snapshot, commands/poll/ack, session-login/logout, configuration, lease i enforcement/lock-ack |

Postojanje rute ne znači da svaka uloga sme da je koristi. [SecurityConfig](../../gm/src/main/java/com/game_manager/gm/bootstrap/SecurityConfig.java), `@PreAuthorize` i resource policy zajedno određuju pristup. Posebno proveriti scope za management collection odgovore i bulk operacije. Nema aktivne `/workflows` grupe.

## Autentifikacija

Browser login vraća `token` i `user` i postavlja `gm_refresh` cookie. Za zaštićene zahteve slati `Authorization: Bearer <access-token>`. Access token se ne stavlja u URL i ne čuva u localStorage-u.

Pre `POST /auth/refresh` ili `/auth/logout`, pozvati `GET /auth/csrf` uz cookie podršku, pa JSON polje `token` poslati u header-u `X-XSRF-TOKEN`, zajedno sa dobijenim cookie-jem. `gm_csrf` je HttpOnly; frontend token dobija kroz API. Refresh token se rotira. Klijenti ne treba da čitaju refresh cookie kroz JavaScript.

Machine API ima odvojen principal: user JWT ne zamenjuje machine JWT. Enrollment/challenge/token su javno dostupni na filter nivou, ali njihove servise štite jednokratni kod/challenge i rate limit. Ostale machine rute zahtevaju `MACHINE_PROTOCOL` i aktuelan station identitet. Detalji su u [machine ugovoru](../contracts/MACHINE_ENROLLMENT_AND_PROTOCOL.md).

## Idempotency i verzije

[IdempotencyFilter](../../gm/src/main/java/com/game_manager/gm/idempotency/IdempotencyFilter.java) zahteva `Idempotency-Key` za sledeće POST rute:

- `/reservations`, `/reservations/recurrence`, `/orders`, `/waitlist/management`;
- `/gaming-sessions/{id}/terminate`, svi POST pozivi pod `/gaming-billing/` i `/gaming-operations/stations/{id}/prepare`.

Ključ je neprazan i najviše 255 znakova, scoped prema principal-u i endpoint-u; telo se kanonizuje za hash. Isti ključ i telo vraćaju sačuvan uspešan odgovor i `Idempotency-Replayed: true`. Drugo telo sa istim ključem vraća 409. Obrada koja još traje vraća **425 Too Early** sa `Retry-After: 2`. Timeout retry iste komande treba da zadrži isti ključ; namerno izmenjena komanda dobija novi ključ.

Update/status/application/assignment DTO-i često imaju očekivanu `version`; neke rute je primaju kao query parametar. Proveriti konkretan DTO i kontroler. Konflikt vraća 409: učitati aktuelno stanje i ponovo potvrditi korisnikovu nameru. Ne raditi automatski retry sa novom verzijom.

## Liste, vreme i greške

Standardni paginirani odgovor je `content`, `page`, `size`, `totalElements`, `totalPages`. Backend page indeks je **0-based**, default size 20 i maksimum 100; UI može prikazivati 1-based broj. Sort i filter allow-list su po endpoint-u, ne univerzalni. Neke projekcije, npr. gaming board, vraćaju kompletnu kolekciju ili poseban DTO, a ne `PageResponse`.

Instant vrednosti slati kao ISO-8601 UTC timestamp, poslovne datume kao format koji DTO zahteva. Ne izvoditi backend status iz browser vremena. Gaming odgovori sadrže `serverTime`, `endsAt`, `remainingSeconds` za bezbedan prikaz.

`ApiError` ima `timestamp`, `status`, `error`, `message`, `path`, `requestId`, `code`, `fieldErrors`. Odgovor i header `X-Request-Id` služe dijagnostici bez kopiranja tela zahteva. Tipično: 400 neispravan ulaz, 401 bez važeće autentifikacije, 403 zabrana, 404 nepostojeći ili nedostupan resurs, 409 konflikt, 413 HTTP upload limit, 422 poslovno neispravan ulaz, 423 document još nije CLEAN, 425 obrada istog ključa, 429 rate limit. Posrednički Nginx odgovor pri backend outage-u može biti maintenance HTML umesto API JSON-a.

## Upload, dokumenti i SSE

Upload koristi `multipart/form-data`; form polja se razlikuju po ruti. Document upload traži `resourceType`, `resourceId`, `file`; nova verzija `version`, `file`. MIME/potpis i limiti se proveravaju u backendu. Content je privatni `no-store`, uz poseban javni preview izuzetak samo za aktuelni CLEAN avatar/catalog image. [Bezbednost](SECURITY_ACCESS.md) opisuje ograničenja scanner-a.

Browser stream rute su `/notifications/stream` i `/gaming-sessions/stream`, sa Bearer header-om, reconnect i `Last-Event-ID` podrškom. Nginx ima posebne SSE lokacije bez buffering-a. Machine delivery je durable poll (`afterSequence`) i odvojeni ACK; ne postoji machine WebSocket ugovor.

## OpenAPI

U lokalnom profilu su dostupni `/v3/api-docs` i `/swagger-ui/index.html` na backend portu. Produkcioni profil ih isključuje. Generisana specifikacija zavisi od pokrenute verzije, a ne od arhivske specifikacije. Endpoint/DTO promenu proveriti zajedno sa frontend `src/api`, `src/types` i protocol artefaktima.

Detalji cene, minimalne dopune, dodele i migracije: [Gaming vreme](../GAMING_TIME.md).
