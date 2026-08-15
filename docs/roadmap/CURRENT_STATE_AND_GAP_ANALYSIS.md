# G-Manager — trenutno stanje i gap analiza

Datum analize: 2026-08-02  
Izvor istine: kod, migracije, build fajlovi i testovi u repozitorijumu. Postojeće
specifikacije su korišćene samo za poređenje.

> Istorijska napomena: dokument predstavlja snapshot od 2026-08-02. Kasniji kod
> već sadrži permission policy, audit/outbox/jobs, SSE notifikacije, production
> delivery artefakte, customer CRM i fizički resource model. Aktuelna analiza za
> gaming-session/Windows Client track nalazi se u
> [`GAMING_SESSION_AND_PC_CLIENT_ROADMAP.md`](GAMING_SESSION_AND_PC_CLIENT_ROADMAP.md).

## Izvršni rezime

G-Manager je funkcionalan MVP modularnog monolita za lokalni biznis. Backend je
Spring Boot 4.1/Java 21/MySQL aplikacija organizovana package-by-feature, a
frontend React 19/TypeScript/Vite SPA. Implementirani su autentifikacija,
rotirajući refresh tokeni, role zaštita, korisnici, katalog, radno vreme,
rezervacije, pickup narudžbine, idempotency, optimistic locking, osnovni
dashboard i lokalni upload slika. Najveći jaz nije nedostatak MVP funkcija već
produkcijska zrelost: nema CI/CD-a, Testcontainers/E2E/a11y testova, audit
traga, permission modela, outbox/jobs infrastrukture, strukturiranih logova,
Prometheus/Grafana konfiguracije, backup/restore procedure ni deploy artefakta
za celu aplikaciju.

Sistem je trenutno slojevit unutar feature paketa, ali nije strogo modularan:
moduli direktno koriste tuđe entitete i repozitorijume. To je prihvatljivo za
trenutnu veličinu, ali granice treba zaštititi arhitektonskim testovima pre
daljeg širenja. CQRS, queue, Redis, multi-tenancy i plugin sistem sada nisu
opravdani kao početni zahvati.

## Pregled repozitorijuma

| Oblast | Stvarno stanje |
|---|---|
| Backend | Jedan Maven modul `gm/`; Spring Boot 4.1.0, Java 21 |
| Frontend | Jedna Vite aplikacija `frontend/g-manager/`; React 19, TypeScript |
| Baza | MySQL 8.4 u Compose-u; Flyway V1–V7; H2 MySQL mode u testovima |
| API | `/api/v1/*`, DTO request/response modeli, `PageResponse`, `ApiError` |
| Deployment | Compose pokreće samo MySQL; nema image-a za backend/frontend |
| CI/CD | Nema repozitorijumske `.github/workflows` konfiguracije |
| Dokumentacija | README i osam specifikacija; deo opisuje želje kao završeno stanje |

## Backend arhitektura

### Postoji

- Feature paketi: `auth`, `user`, `catalog`, `workinghours`, `reservation`,
  `order`, `dashboard`, uz `security`, `common`, `idempotency` i `media`.
- Controller → service → repository tok i transakcije pretežno u servisima.
- DTO ulazi/izlazi; JPA entiteti se ne vraćaju direktno iz kontrolera.
- Centralni error model `timestamp/status/error/message/path/requestId`.
- Globalno upravljanje validacijom, konfliktima, upload limitom i neočekivanim
  greškama.
- Standardizovana paginacija (20 podrazumevano, 100 maksimum), filtering i
  sorting za glavne liste.
- UTC skladištenje i poslovna zona `Europe/Belgrade`.
- `@Version` kroz `BaseEntity`; eksplicitna očekivana verzija za kritične
  tranzicije.

### Jaz

- Granice feature paketa nisu formalno kontrolisane; servisi direktno zavise od
  repozitorijuma/entiteta drugih modula.
- Nema application/domain/infrastructure slojeva niti eksplicitnih portova.
  Potpuni DDD rewrite nije opravdan; potrebna je postepena izolacija.
- Mapiranje je ručno uprkos MapStruct dependency-ju.
- Konfiguracija je rasuta kroz `@Value`, bez validiranih
  `@ConfigurationProperties`.
- Nema domain event/outbox modela, background job frameworka ni retry/DLQ
  semantike.
- Nema feature flag mehanizma.

## Baza i migracije

### Postoji

- Flyway V1–V7 kreira korisnike, refresh tokene, katalog, radno vreme,
  rezervacije, idempotency ključeve, narudžbine i stavke.
- FK, unique/check constraints i indeksi postoje za najvažnije pristupe.
- `ddl-auto=validate`; aplikacija ne generiše produkcionu šemu.
- UUID se skladišti kao `CHAR(36)`, vreme kao UTC `TIMESTAMP(6)`.
- Dashboard koristi agregatne repository upite umesto učitavanja entiteta.

### Jaz

- Testovi migracija koriste H2 kompatibilni režim, ne pravi MySQL; dialect i
  Flyway regresije mogu proći neprimećeno.
- Ne postoji test migracije nad praznom i prethodnom MySQL šemom.
- Nema soft-delete kolona, audit tabela, outbox tabela, arhiviranja ni retention
  poslova.
- Nema dokumentovane backup/restore procedure niti izvršenog restore testa.
- Dokumentacija na više mesta navodi PostgreSQL i GIN indekse, dok je stvarni
  izbor MySQL.

## Security

### Postoji

- Kratkotrajni JWT access token; tajna mora imati najmanje 32 UTF-8 bajta.
- Refresh token je nasumičan, u HttpOnly/SameSite=Strict cookie-ju, u bazi se
  čuva samo SHA-256 hash.
- Refresh token rotation i detekcija ponovne upotrebe opozivaju sve korisnikove
  sesije.
- Aktivni korisnik i njegova trenutna rola učitavaju se iz baze pri svakom JWT
  zahtevu.
- BCrypt lozinke; generična login greška; inicijalni OWNER se provisionuje samo
  eksplicitnom konfiguracijom.
- Deny-by-default ruta, CORS allow-list, security headers i role pravila.
- In-memory rate limiting za login, registraciju, rezervacije i narudžbine.
- Upload proverava veličinu, MIME i magic bytes te normalizuje putanju.

### Jaz i rizici

- Role matcher-i su centralizovani u `SecurityConfig`; nema permission modela
  niti method-level autorizacije.
- Resource-level pravila su u servisima, ali nisu predstavljena jedinstvenom
  politikom i teško ih je auditovati.
- Nema liste aktivnih uređaja/sesija, selektivnog opoziva, login istorije ni
  security audit događaja.
- Rate limit je memorijski: resetuje se restartom i nije konzistentan između
  instanci; proxy-aware identitet klijenta nije definisan.
- Javni `GET /media/**` znači da avatar i kataloške slike nemaju resource
  permissions; prihvatljivo samo ako se formalno proglase javnim.
- Nema CSP/HSTS produkcione politike, dependency/SAST/DAST skeniranja ni
  dokumentovanog OWASP pregleda.
- MFA nije implementiran i nije prioritet pre stabilnog permission/audit sloja.

## Testovi

### Postoji

- 42 backend testa u 13 klasa: Spring context, auth tokovi, security osnova,
  korisnici, katalog, radno vreme, rezervacije, narudžbine, dashboard,
  repository, JWT, rate limit i exception handler.
- Integracioni testovi proveravaju role, osnovna poslovna pravila,
  idempotency/optimistic locking i API odgovore.
- Vitest testovi pokrivaju auth store, error poruke, Zod šeme, datume i
  kalkulaciju prikaza korpe.
- Frontend ima ESLint, TypeScript typecheck i production build skripte.

### Jaz

- Nema Testcontainers/MySQL integration testova.
- Nema eksplicitnih arhitektonskih, contract, concurrency/load, migration,
  backup/restore ili performance testova.
- Nema React Testing Library komponentnih testova.
- Nema Playwright E2E, accessibility ili visual regression testova.
- Nema coverage pragova ni CI okruženja koje ove provere obavezno izvršava.

## Frontend arhitektura i state management

### Postoji

- Role-aware React Router zaštita kroz `ProtectedRoute` i `RoleGuard`.
- Centralni Axios klijent, Bearer access token u memoriji i single-flight
  refresh retry na 401.
- Zustand auth store; React Hook Form/Zod na auth formama i Zod validacija u
  nekim domenima.
- Odvojeni API klijenti i TypeScript modeli po feature-u.
- Lazy loading dashboard rute; Vite proxy za `/api` i `/media`.
- Error boundary i centralno prevođenje 409/413/429/5xx grešaka.

### Jaz

- TanStack Query je dependency, ali stranice uglavnom ručno upravljaju
  `useEffect/useState` fetch ciklusom; caching/invalidation nisu standardizovani.
- Velike page komponente spajaju query, formu, tabelu/kartice i mutations.
- Nema shared komponentnog/design-system sloja.
- Loading, empty, success i error stanja nisu dosledna; skeleton, toast, undo,
  dirty-form guard i fokus prvog invalidnog polja nisu sistemski rešeni.
- Nema saved views, global search, command palette, keyboard shortcuts,
  favorites, bulk/inline editing ili virtualizacije.
- Kod sadrži vidljive mojibake nizove (`UÄitavanje`, `NarudÅ¾bine`) u više
  TSX fajlova, što je korisnički vidljiv kvalitetni defekt.

## UX, vizuelni dizajn i pristupačnost

### Postoji

- Konzistentna tamna vizuelna osnova u globalnim CSS fajlovima.
- Role-specifična navigacija, validacione poruke, disable tokom nekih submit-a,
  responsive grid/table wrapper-i i osnovna alert/status semantika.
- Dashboard ima KPI kartice, pie i bar chart, filter perioda i empty stanje.

### Jaz

- Nema formalnih design tokena, light teme, density opcije ni dokumentovanih
  komponentnih standarda.
- Navigacija nema breadcrumbs, mobilni meni, jasne page metadata niti
  očuvanje filtera u URL-u.
- Accessibility nije testirana; grafikoni nemaju tabelarni fallback, opis
  metrike ni keyboard/screen-reader alternativu.
- Nema WCAG 2.2 AA cilja, reduced-motion pravila, sistemske focus kontrole ili
  provere kontrasta/zoom-a.
- Dashboard nema trend, prethodni period, drill-down, cilj/prag, eksport,
  workload, attendance, kapacitet, heatmap niti personalizaciju.

## Observability i operacije

### Postoji

- Actuator izlaže `health`, `info`, `metrics`; health je javan, metrics je
  OWNER/ADMIN.
- Micrometer metrike dolaze kroz Actuator.
- `X-Request-Id` se validira/generiše, vraća u odgovoru i stavlja u MDC.
- Neočekivane greške ne vraćaju stack trace niti secret.

### Jaz

- Logovi nisu JSON/strukturirani; nema standarda događaja i redakcije po polju.
- Nema Prometheus registry-ja, Grafana dashboarda, alert pravila, readiness/
  liveness grupa, job/cache health indikatora ni Sentry integracije.
- Nema trace propagacije/distributed tracing-a; za trenutni monolit dovoljan je
  correlation/request ID dok se ne uvedu spoljne asinhrone zavisnosti.
- Nema graceful shutdown/deployment probe konfiguracije.

## CI/CD i produkcijska spremnost

- Nema CI workflow-a, dependency cache-a, lint/format gate-a, image builda,
  SBOM-a, vulnerability scan-a, staginga, smoke testa ili rollback procedure.
- Compose definiše samo MySQL sa lokalnim kredencijalima.
- Backend i frontend nemaju Dockerfile; frontend nema definisan web server.
- `.env` je ignorisan i local profil ga učitava; prod i dalje zahteva spoljne
  tajne. To je dobra osnova.
- Nema HTTPS termination, secret manager integracije, deployment manifesta,
  backup/restore automatizacije ni release/changelog procesa.

## Funkcionalnosti po statusu

### Potpuno implementirano za MVP obim

- JWT autentifikacija i učitavanje aktivnog korisnika iz baze.
- Customer registracija, login, logout, refresh rotation/reuse detection.
- Role-aware user management i profil/promena lozinke.
- Katalog PRODUCT/SERVICE sa aktivacijom, slikom, filtering/pagination.
- Nedeljno radno vreme i izuzeci.
- Rezervacije sa proverom usluge, budućnosti, radnog vremena i preklapanja.
- Pickup narudžbine sa server-side cenama i snapshot stavkama.
- State transition pravila za rezervacije i narudžbine.
- Idempotency za create reservation/order i optimistic locking.
- Osnovni management i operativni dashboard.
- Standardni API error i request ID.

### Delimično implementirano

- Modularni monolit: feature paketi postoje, granice nisu enforce-ovane.
- Rate limiting: radi samo u jednoj instanci i nije proxy/distributed spreman.
- Observability: Actuator/request ID postoje, nema produkcionog telemetry stacka.
- Upload: validacija je dobra za slike, ali nema metadata/verzija/skenera/object
  storage-a niti privatnog pristupa.
- Frontend UX: funkcionalne forme/liste postoje, ali bez doslednih shared stanja.
- Vizualizacija: osnovni KPI/pie/bar postoji, bez trenda/drill-down/a11y fallbacka.
- Testiranje: dobre MVP integracije, bez realne MySQL/E2E/a11y/load pokrivenosti.

### Implementirano problematično

- Dokumentovane produkcione osobine nisu podržane deployment artefaktima.
- In-memory rate limit može dati lažan osećaj zaštite u više instanci.
- Javni media endpoint ne razlikuje javni katalog od potencijalno osetljivih
  korisničkih dokumenata.
- Mojibake tekstovi degradiraju frontend i mogu maskirati encoding problem.
- H2 MySQL mode nije dovoljna validacija MySQL Flyway migracija.

### Dokumentovano, ali nije implementirano

- Soft delete/restore, audit log i definisana data retention.
- Daily backup i restore procedura.
- Permission-based autorizacija.
- Notification system, real-time, dokumenti, report engine i workflow.
- CI/CD, staging, deployment, rollback i security scanning.
- Napredni dashboard KPI-jevi navedeni u starom planu (npr. broj korisnika i
  aktivne kataloške stavke).

### Potpuno odsutno

- Outbox/domain events/background report/notification jobs.
- Prometheus/Grafana/Sentry/alerting konfiguracija.
- Component/E2E/accessibility/visual/load testovi.
- Global search, command palette, saved views i notification center.
- PDF/Excel/CSV report pipeline i scheduled reports.
- PWA/offline, multi-tenancy, plugin i AI funkcije.

### Blokirano prethodnim nedostacima

- Pouzdane notifikacije i report jobs blokiraju outbox/job infrastruktura.
- Multi-instance real-time i rate limiting blokiraju shared infrastructure
  odluke (Redis/queue) i stateless deployment.
- Multi-tenancy blokiraju permission/audit model i odluka o izolaciji podataka.
- AI funkcije blokiraju kvalitetni podaci, permissions, audit i stabilni report
  read modeli.

## Dokumentacija naspram koda

| Tvrdnja dokumentacije | Stvarni kod |
|---|---|
| Spring Boot 3 | `pom.xml` koristi Spring Boot 4.1.0 |
| PostgreSQL | MySQL 8.4 + `flyway-mysql`; H2 u testu |
| „Sve produkcione definicije postoje“ | Nema CI/deploy/backup/alerting artefakata |
| Soft delete korisnika | `active` deaktivacija; nema deletedAt/restore |
| Audit polja/audit | `createdAt/updatedAt` postoje; audit događaji ne postoje |
| MapStruct konvencija | Dependency postoji, mapiranje je ručno |
| Frontend `/components`, `/routes`, provider struktura | Kod koristi ravne pages, inline Routes i Zustand |
| Dnevni backup/test restore | Nema skripte, procedure ni testa |
| Monitoring error rate/response time/DB | Actuator osnova postoji, nema scrape/dashboard/alert setupa |
| „Sistem spreman bez nepoznatih“ | Više ključnih odluka je otvoreno; vidi ADR backlog |

## Najvažniji tehnički dug i rizici

1. Nema automatizovanog quality gate-a; regresije zavise od lokalnog izvršavanja.
2. Nema produkcionog deployment/backup/restore puta.
3. Authorization raste kao lista URL matcher-a i servisnih `if` pravila.
4. Auditabilnost poslovnih i security promena ne postoji.
5. H2 može sakriti MySQL migracione i concurrency probleme.
6. Nema pouzdanog mehanizma za asinhrone side-effect-e.
7. Frontend nema komponentni testni i accessibility safety net.
8. Dokumentacija preuveličava implementirano stanje i navodi pogrešan DB/stack.
9. Lokalni filesystem upload nije pogodan za horizontalno skaliranje.
10. Mojibake ukazuje na nekonzistentno kodiranje korisničkog teksta.

## Preporučeni smer

Zadržati modularni monolit, MySQL i REST. Najpre stabilizovati build/config i
uskladiti dokumentaciju, zatim enforce-ovati granice, dodati real-MySQL testove,
permission/audit sloj i CI. Tek potom uvoditi events/outbox, observability i
UX/design-system poboljšanja. Redis, queue, multi-tenancy i AI uvoditi samo
nakon merljivog razloga i odluke iz `ARCHITECTURE_DECISION_BACKLOG.md`.
