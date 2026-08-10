# G-Manager — master implementation roadmap

Status dokumenta: `PLANNED`  
Datum: 2026-08-02  
Osnova: `CURRENT_STATE_AND_GAP_ANALYSIS.md`

Ovo je autoritativni dokument za buduću komandu „Izvrši kompletan Stage N
prema prethodno definisanom planu“. Stage se ne sme proširivati na sledeći
stage osim minimalnog tehničkog preduslova opisanog pravilima izvršavanja.

## Pregled faza i prioriteta

| Faza | Stage-ovi | Tema |
|---|---:|---|
| Phase 0 — Stabilna osnova | 1–2 | build, okruženje, dokumentacija, granice |
| Phase 1 — Podaci i API | 3–4 | realna baza, migracije, API ugovor |
| Phase 2 — Security i integritet | 5–8 | permissions, sesije, audit, konkurentnost |
| Phase 3 — Quality automation | 9–10 | testna infrastruktura i CI/CD |
| Phase 4 — Pouzdanost i operacije | 11–14 | events, jobs, observability, performanse |
| Phase 5 — UX temelj | 15–17 | design system, a11y, forme/tabele |
| Phase 6 — Produktivnost i podaci | 18–19 | global search i dashboard |
| Phase 7 — Komunikacija i sadržaj | 20–23 | notifikacije, dokumenti, izveštaji, workflow |
| Phase 8 — Klijentska otpornost | 24 | PWA i ograničeni offline režim |
| Phase 9 — Skaliranje | 25 | feature flags i multi-tenancy readiness |
| Phase 10 — Produkcija | 26 | deploy, backup, hardening, release |
| Phase 11 — Opcioni horizont | 27 | AI i plugin extension points |

Prioriteti: 14 **OBAVEZNO**, 9 **PREPORUČENO**, 2 **OPCIONO**, 2
**DUGOROČNO**. Veličine su relativne (`XS`, `S`, `M`, `L`, `XL`), ne vremenske.

---

## Phase 0 — Analiza i stabilizacija

## Stage 1 — Reproducibilan build i razvojno okruženje

Izvršni status: **BLOCKED** (2026-08-02) — implementacija i sve automatizovane
backend/frontend provere su završene. Compose/MySQL startup acceptance kriterijum
nije moguće izvršiti u trenutnom okruženju jer Docker CLI nije instaliran, a
postojeća spoljna MySQL instanca odbija lokalnog korisnika `gmanager`. Puni
Spring ApplicationContext je potvrđen kroz test profil; Stage može preći u
`DONE` nakon `docker compose up -d mysql`, backend starta i health provere na
mašini sa Docker Compose-om.

### Status prioriteta
OBAVEZNO

### Cilj
Jedna dokumentovana, reproduktivna lokalna putanja podiže MySQL, backend i
frontend, a baseline provere prolaze na čistom checkout-u.

### Poslovna vrednost
Smanjuje onboarding i rizik da budući stage rešava lokalne, a ne produktne
probleme.

### Tehničko obrazloženje
Compose trenutno podiže samo MySQL, `.env` je local-only, nema root task
orchestracije, a dokumentacija delom navodi zastareo stack.

### Preduslovi
Nema.

### Trenutno stanje
Postoje Maven/Vite skripte, MySQL Compose, profili `local/test/prod` i README
uputstvo; lokalni DB kredencijali mogu odstupati od Compose-a.

### Gap analiza
Nedostaju proverljiv preflight, usklađene verzije/toolchain, health-smoke
procedura i tačan inventory podržanih platformi.

### Obim
Verifikacija Java/Node/Maven verzija, env ugovora, Compose health-a, UTF-8
kodiranja i root razvojnih komandi; ispravka mojibake korisničkih tekstova.

### Van obima
CI workflow, produkcioni Docker image i funkcionalne promene.

### Backend zadaci
Validirati profile i typed startup konfiguraciju bez produkcionih fallback
tajni; dodati smoke context/startup proveru ako nedostaje.

### Frontend zadaci
Uskladiti UTF-8 tekstove i environment dokument; potvrditi dev proxy i baseline
lint/typecheck/test/build.

### Database zadaci
Bez šema promene. Potvrditi Compose inicijalizaciju praznog volumena; brisanje
postojećih podataka nije deo stage-a.

### API promene
Nema.

### Security zahtevi
`.env` ostaje ignorisan; prod zahteva spoljne tajne; nijedna tajna ne ulazi u
log ili dokumentaciju.

### UX zahtevi
Svi postojeći tekstovi moraju biti čitljiv UTF-8; postojeće loading/error
ponašanje se ne menja.

### Testovi
Backend context, frontend postojeći testovi i smoke health/startup.

### Observability
Startup mora jasno prijaviti aktivni profil i health bez vrednosti tajni.

### Dokumentacija
Uskladiti root/frontend README i env tabelu sa stvarnim MySQL/Spring Boot 4
stackom.

### Verovatno pogođeni fajlovi i moduli
`README.md`, `frontend/g-manager/README.md`, `docker-compose.yml`,
`gm/src/main/resources/application*.yml`, postojeći TSX tekstovi; eventualno
nov root skript/task fajl (nov).

### Breaking changes
Nema.

### Migraciona strategija
Nema data migracije; postojeći lokalni `.env` ostaje kompatibilan.

### Rizici
Lokalna MySQL usluga može zauzeti port 3306; skripta ne sme brisati volume.

### Acceptance criteria
- Dokumentovane komande rade iz čistog checkout-a.
- Backend stiže do `Started GmApplication` sa Compose bazom.
- UI više nema poznate mojibake nizove.
- Sve baseline provere prolaze bez ručnog IntelliJ podešavanja.

### Definition of Done
Opšti DoD važi; dodatno su Windows/PowerShell i Bash putanje praktično
proverene i nema commitovanih tajni.

### Procena veličine
M

### Validacija nakon implementacije
`docker compose config`; `docker compose up -d mysql`; u `gm/`:
`.\mvnw.cmd clean verify` i `.\mvnw.cmd spring-boot:run`; u
`frontend/g-manager/`: `npm ci`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`; ručno proveriti `/actuator/health` i login stranu.

## Stage 2 — Enforce-ovane granice modularnog monolita

**Izvršni status: DONE (2026-08-02).** Granice modula su dokumentovane i
enforce-ovane ArchUnit/ESLint pravilima; ciklusi su uklonjeni, konfiguracija je
typed i validirana, a ADR-01 i ADR-02 su zatvoreni.

### Status prioriteta
OBAVEZNO

### Cilj
Postojeći feature paketi dobijaju dokumentovane granice i automatske
arhitektonske testove bez rewrite-a domena.

### Poslovna vrednost
Smanjuje regresije i omogućava paralelno širenje funkcija.

### Tehničko obrazloženje
Package-by-feature postoji, ali cross-module zavisnosti nisu kontrolisane;
MapStruct je dependency bez dosledne upotrebe, a `@Value` je rasut.

### Preduslovi
Stage 1.

### Trenutno stanje
Jedan Maven modul sa controller/service/repository klasama po feature-u.

### Gap analiza
Nema pravila dozvoljenih zavisnosti, application portova, typed config-a ni
odluke o mapper strategiji.

### Obim
ArchUnit pravila; eksplicitni public module API za najproblematičnije
cross-feature pozive; validirani `@ConfigurationProperties`; ADR-01/02.

### Van obima
Mikroservisi, multi-module build, CQRS i masovno premeštanje svih klasa.

### Backend zadaci
Inventarisati dependency graph; zabraniti controller→repository i cycle;
izolovati security/current-user i shared DTO/config contracts; standardizovati
mapper pristup; zadržati transakcije u application servisima.

### Frontend zadaci
Dokumentovati feature granice i zabraniti page→raw Axios mimo `src/api`;
bez vizuelnih promena.

### Database zadaci
Nisu potrebni.

### API promene
Nema eksternih promena.

### Security zahtevi
Security policy ostaje backend granica; auth entiteti ne smeju procuriti u DTO.

### UX zahtevi
Nema ponašajnih promena; loading/error/success ostaju isti.

### Testovi
ArchUnit testovi za backend i frontend import-boundary lint/test.

### Observability
Bez novih runtime metrika; arhitektonski test izveštaj mora imenovati prekršaj.

### Dokumentacija
Novi `docs/architecture/MODULE_BOUNDARIES.md` i ADR-01/02.

### Verovatno pogođeni fajlovi i moduli
`gm/pom.xml`, `gm/src/test/.../architecture/` (nov), `gm/src/main/.../common/config/`,
izabrani module service/API fajlovi, frontend ESLint config.

### Breaking changes
Nema; interni Java potpisi mogu se promeniti.

### Migraciona strategija
Postepeno uvesti facade/port pa prebaciti consumer; bez big-bang reorganizacije.

### Rizici
Prestroga pravila mogu formalizovati pogrešne granice; izuzeci moraju imati
vlasnika i rok.

### Acceptance criteria
- Nema ciklusa između feature modula.
- Controller ne pristupa repository-ju.
- Konfiguracija kritičnih podsistema je typed i startup-validirana.
- ArchUnit i frontend boundary provere padaju na namernom prekršaju.

### Definition of Done
Opšti DoD; postojeći API i poslovni testovi ostaju zeleni, ADR odluke su
zaključene.

### Procena veličine
L

### Validacija nakon implementacije
`.\mvnw.cmd clean verify`; `npm run lint && npm run typecheck && npm test &&
npm run build`; pregled generisanog module dependency dijagrama.

---

## Phase 1 — Podaci i API ugovor

## Stage 3 — MySQL-verne migracije i integritet šeme

**Izvršni status: BLOCKED (2026-08-08).** Implementirani su MySQL 8.4
Testcontainers profil, migration/upgrade/schema/repository/concurrency testovi i
V8 korekcija stranih ključeva. Lokalna validacija profila čeka dostupan Docker
CLI/daemon; brzi H2 suite ostaje odvojen.

### Status prioriteta
OBAVEZNO

### Cilj
Flyway i repository/concurrency ponašanje se testiraju na istoj MySQL verziji
kao lokalna/produkcijska baza.

### Poslovna vrednost
Sprečava deploy kvarove i gubitak/nekonzistentnost podataka.

### Tehničko obrazloženje
H2 MySQL mode ne verifikuje stvarni dialect, indekse, locks i migration upgrade.

### Preduslovi
Stage 1; ADR-03.

### Trenutno stanje
V1–V7, `ddl-auto=validate`, MySQL 8.4 Compose, H2 test profil.

### Gap analiza
Nema Testcontainers MySQL suite-a, upgrade testa ni query-plan baseline-a.

### Obim
Testcontainers profil; prazna i V(n-1)→latest migracija; FK/check/index
assertions; repository i optimistic concurrency testovi na MySQL.

### Van obima
Promena DB engine-a, soft delete/audit šema i performance tuning svih upita.

### Backend zadaci
Dodati container test bootstrap i odvojiti brze H2 od MySQL-vernih testova.

### Frontend zadaci
Nema.

### Database zadaci
Samo korektivne aditivne Flyway migracije ako test otkrije stvarni šema gap;
nikada ne menjati primenjene V1–V7.

### API promene
Nema.

### Security zahtevi
Container kredencijali su efemerni; nema produkcionih tajni.

### UX zahtevi
Nema.

### Testovi
Migration, repository, unique/FK/check, timezone precision i concurrent update
testovi na MySQL 8.4.

### Observability
Test izveštaj beleži trajanje migracija, bez connection passworda.

### Dokumentacija
Test suite i migration authoring pravila.

### Verovatno pogođeni fajlovi i moduli
`gm/pom.xml`, `gm/src/test/resources/`, `gm/src/test/.../migration/` (nov),
eventualni `gm/src/main/resources/db/migration/V8__*.sql` (nov).

### Breaking changes
Nema planiranih.

### Migraciona strategija
Expand-only korekcije, test prazne i postojeće šeme; rollback je roll-forward.

### Rizici
Docker mora biti dostupan u CI/lokalno; testovi su sporiji i moraju biti
odvojeno označeni.

### Acceptance criteria
- Sve migracije prolaze na MySQL 8.4 od prazne baze.
- Upgrade fixture prolazi do latest verzije.
- Hibernate validate i kritični constraints/indeksi su potvrđeni.
- Najmanje jedan realan optimistic-lock concurrency test prolazi.

### Definition of Done
Opšti DoD; H2 se više ne predstavlja kao migration dokaz.

### Procena veličine
M

### Validacija nakon implementacije
`.\mvnw.cmd clean verify -Pmysql-it`; ponoviti suite sa praznim containerom i
upgrade fixture-om; `docker compose config`.

## Stage 4 — Stabilan API ugovor, validacija i OpenAPI

### Status prioriteta
OBAVEZNO

### Cilj
Svi postojeći endpoint-i imaju dosledan validation/error/pagination ugovor i
generisanu proverljivu OpenAPI specifikaciju.

### Poslovna vrednost
Frontend i buduće integracije dobijaju predvidiv API bez skrivenih breaking
promena.

### Tehničko obrazloženje
Osnova postoji, ali error detalji, sort allow-list, API docs i contract tests
nisu kompletni; springdoc verziju treba potvrditi uz Spring Boot 4.

### Preduslovi
Stage 2–3; ADR-04.

### Trenutno stanje
`/api/v1`, DTO, `ApiError`, `PageResponse`, Bean Validation i global handler.

### Gap analiza
Nema field-error kolekcije/error code-a, eksplicitnog sort allow-lista,
OpenAPI quality gate-a ni generisanih frontend tipova/contract provere.

### Obim
Stabilizovati error codes i field errors aditivno; allow-list pagination/sort;
OpenAPI schema/security/status dokumentacija; contract test i compatibility
check.

### Van obima
GraphQL, generički success envelope i `/api/v2`.

### Backend zadaci
Centralizovati request validation, status kodove i pagination parser;
dokumentovati sve endpoint-e i permissions.

### Frontend zadaci
Uskladiti `ApiError`, centralni prikaz field grešaka i contract/type proveru.

### Database zadaci
Nisu potrebni.

### API promene
Aditivna `code`/`fieldErrors` polja u `ApiError`; ne menjati postojeća polja.

### Security zahtevi
OpenAPI ne sme izložiti tajne/interne stack detalje; production Swagger pristup
mora biti eksplicitno konfigurisan.

### UX zahtevi
Forma čuva unos, fokusira prvo invalidno polje i razlikuje validation/conflict/
rate-limit/server stanje.

### Testovi
Controller validation, error contract, pagination/sort abuse i OpenAPI snapshot
compatibility.

### Observability
Error code i request ID dostupni za podršku; validation vrednosti se ne loguju.

### Dokumentacija
`docs/api/` (nov), endpoint/permission matrica i compatibility policy.

### Verovatno pogođeni fajlovi i moduli
`gm/common/error`, `gm/common/config/PaginationConfig.java`, svi kontroleri/DTO,
`gm/pom.xml`, `frontend/src/types/api.types.ts`, `frontend/src/api/`.

### Breaking changes
Nema; aditivne response promene.

### Migraciona strategija
Frontend prvo prihvata opciona nova polja, zatim backend počinje da ih šalje.

### Rizici
Preterano detaljne validation poruke mogu otkriti internu strukturu.

### Acceptance criteria
- Svi endpoint-i su u OpenAPI-ju sa statusima i auth zahtevom.
- Nevalidan sort/property ne može izazvati 500.
- Error contract testira svaku standardnu kategoriju.
- Frontend pravilno prikazuje field i request-ID greške.

### Definition of Done
Opšti DoD; OpenAPI compatibility check prolazi.

### Procena veličine
L

### Validacija nakon implementacije
`.\mvnw.cmd clean verify`; izvesti `/v3/api-docs` i pokrenuti contract diff;
frontend lint/typecheck/test/build; ručno 400/401/403/409/429/500 scenariji.

---

## Phase 2 — Security i integritet podataka

## Stage 5 — Permission i resource-level autorizacija

### Status prioriteta
OBAVEZNO

### Cilj
Role ostaju korisnički koncept, ali backend odluke koriste imenovane
permissions i proverljive resource policy-je.

### Poslovna vrednost
Sprečava horizontalni/vertikalni neovlašćeni pristup dok sistem raste.

### Tehničko obrazloženje
URL matcher-i i ad-hoc servisni uslovi su teško pregledni i ne skaliraju.

### Preduslovi
Stage 2, 4; ADR-05.

### Trenutno stanje
Deny-all `SecurityConfig`, DB role refresh na svakom zahtevu i servisne ownership
provere za orders/reservations/users.

### Gap analiza
Nema permission kataloga, centralnih policy objekata ni potpune matrice testova.

### Obim
Permission enum/katalog, role→permission map, method/resource authorization,
centralna policy pravila i frontend capability model.

### Van obima
Custom role editor, tenant permissions i MFA.

### Backend zadaci
Uvesti method security/policy servise; smanjiti broad `authenticated()` PATCH
matcher-e; eksplicitno proveriti owner/customer/handler pravila.

### Frontend zadaci
Nav i action visibility zasnovati na capabilities iz sesije ili zajedničke
role mape; backend ostaje autoritet.

### Database zadaci
Ako se mapa čuva u kodu, nema migracije; ako ADR zahteva tabele, nova aditivna
migracija i seed svih postojećih role prava.

### API promene
Auth/user summary može aditivno dobiti `permissions`; statusi ostaju 403/404
prema anti-enumeration politici.

### Security zahtevi
Default deny, object-level provera pre mutacije, zaštita OWNER-a i zabrana
self-escalation-a.

### UX zahtevi
Nedostupne akcije nisu prikazane; 403 ima jasnu, pristupačnu stranicu bez
otkrivanja resursa.

### Testovi
Potpuna role×endpoint×resource matrica, IDOR negativni testovi i frontend guard
testovi.

### Observability
Audit-ready authorization denial događaj bez osetljivih detalja.

### Dokumentacija
Permission matrica i threat-model dodatak.

### Verovatno pogođeni fajlovi i moduli
`gm/security/SecurityConfig.java`, novi `gm/security/permission/`, svi application
servisi sa ownership pravilima, auth DTO, frontend auth/guards/nav.

### Breaking changes
Moguće zatvaranje ranije preširoko dozvoljenih zahteva; dokumentovati kao
security correction.

### Migraciona strategija
Shadow-log policy odluke, zatim enforce; postojeće role zadržavaju legitimna
prava.

### Rizici
Pogrešna mapa može blokirati operacije ili otvoriti podatke; matrica je obavezna.

### Acceptance criteria
- Svaki endpoint ima imenovani permission i resource policy.
- CUSTOMER ne može pristupiti tuđem order/reservation resursu.
- EMPLOYEE ne može menjati resurs van definisanog handler pravila.
- OWNER zaštite i self-escalation testovi prolaze.

### Definition of Done
Opšti DoD; kompletna matrica je testirana i dokumentovana.

### Procena veličine
XL

### Validacija nakon implementacije
Backend security suite + `clean verify`; frontend guard/component testovi i
build; ručno proveriti četiri role i negativne IDOR zahteve.

## Stage 6 — Upravljanje sesijama i security događajima

### Status prioriteta
PREPORUČENO

### Cilj
Korisnik vidi i opoziva pojedinačne ili sve refresh sesije; login/refresh/logout
događaji imaju bezbednu istoriju.

### Poslovna vrednost
Omogućava odgovor na kompromitovan uređaj bez promene lozinke svih korisnika.

### Tehničko obrazloženje
Rotation/reuse detection postoji, ali token nema device metadata ni UI.

### Preduslovi
Stage 5.

### Trenutno stanje
Hashirani refresh token, expiry, revoked i replacement chain.

### Gap analiza
Nema session label/lastSeen/IP hash/user-agent summary/endpoints/history.

### Obim
Device session metadata, list/revoke one/revoke all, login history i retention.

### Van obima
MFA, geolocation tracking i access-token blacklist.

### Backend zadaci
Session DTO/endpoints, safe user-agent parser, last-seen throttling, ownership
policy i reuse security event.

### Frontend zadaci
Session stranica sa current-device oznakom, revoke dijalogom, loading/empty/
error/success stanjima.

### Database zadaci
Aditivne kolone/tabela session events, indeksi user/last_seen; backfill
`unknown device`; retention job dolazi Stage 12.

### API promene
Novi `/api/v1/auth/sessions`, DELETE one/all; postojeći auth tok kompatibilan.

### Security zahtevi
Ne čuvati raw IP/token; selektivni revoke zahteva ownership; cookie cleanup.

### UX zahtevi
Current session se ne može nejasno izgubiti; potvrda samo za revoke all.

### Testovi
Rotation chain, concurrent refresh, ownership, inactive user, cookie i UI
component testovi.

### Observability
Login success/failure aggregate, reuse/revoke security event bez credentiala.

### Dokumentacija
Session lifecycle i incident response.

### Verovatno pogođeni fajlovi i moduli
`gm/auth/RefreshToken*.java`, `AuthController/Service`, nova migracija,
frontend profile/session page/API/types.

### Breaking changes
Nema.

### Migraciona strategija
Nullable metadata pa backfill/default; stari tokeni ostaju validni.

### Rizici
User-agent/IP metadata je lični podatak; minimalizacija i retention su obavezni.

### Acceptance criteria
- Korisnik vidi samo svoje sesije i opoziva izabranu/sve.
- Raw refresh token/IP nisu u bazi/logu.
- Reuse opoziva chain i pravi security event.
- UI radi na praznom i multi-device stanju.

### Definition of Done
Opšti DoD; privacy/retention pravila dokumentovana.

### Procena veličine
L

### Validacija nakon implementacije
Auth/security integration suite, migration MySQL suite, frontend test/build;
ručni login iz dva browser context-a i selektivni revoke.

## Stage 7 — Audit log, ciljano soft delete i restore

### Status prioriteta
OBAVEZNO

### Cilj
Osetljive promene su dokazive, a user/catalog resursi mogu bezbedno biti
deaktivirani, soft-obrisani i vraćeni.

### Poslovna vrednost
Podrška, bezbednost i usklađenost dobijaju ko/šta/kada trag i oporavak greške.

### Tehničko obrazloženje
`createdAt/updatedAt` nisu audit; `active=false` nema actor/reason/restore
semantiku.

### Preduslovi
Stage 3, 5; ADR-07/08.

### Trenutno stanje
JPA audit timestamps i status/active polja; nema audit events.

### Gap analiza
Nema append-only događaja, redakcije, permissiona, deletedAt/by/reason ni restore.

### Obim
Audit event schema/service/query; audit ključnih auth, user, catalog,
reservation/order status i settings akcija; soft delete/restore user/catalog.

### Van obima
Event sourcing, soft delete operativnih transakcija i SIEM integracija.

### Backend zadaci
Audit writer u istoj transakciji, redigovan before/after diff, query API;
default exclude deleted i eksplicitni restore policies.

### Frontend zadaci
Admin audit pregled sa filterima i restore UI sa jasnom potvrdom.

### Database zadaci
`audit_events` i ciljane delete kolone/indeksi; backfill postojećih active
resursa; append-only DB privilegija preporuka.

### API promene
Novi audit list/detail i delete/restore endpoint-i; postojeći deactivate ostaje
kompatibilan tokom prelaza.

### Security zahtevi
Audit read OWNER/ograničeni ADMIN; nema password/token/full document sadržaja;
audit se ne menja kroz javni API.

### UX zahtevi
Filteri u URL-u, empty/error/loading, reason input, prikaz vremena u poslovnoj
zoni uz UTC podatak.

### Testovi
Audit atomicity/redaction/permissions, soft-delete query isolation, unique email
restore konflikt, migration/backfill.

### Observability
Metrije audit write failure; poslovna transakcija ne sme uspeti bez obaveznog
audita.

### Dokumentacija
Audit event katalog, retention i restore runbook.

### Verovatno pogođeni fajlovi i moduli
Novi `gm/audit/`, `BaseEntity` ili ciljane entitete/repozitorijume, user/catalog
servise, nove migracije, frontend audit stranice/routes/API.

### Breaking changes
Semantika listanja obrisanih resursa se menja; default ostaje bez obrisanih.

### Migraciona strategija
Dodati nullable kolone, deploy dual semantics, backfill, zatim enforce; restore
rešava unique konflikt eksplicitno.

### Rizici
Audit može sadržati PII i rasti brzo; redakcija/retention/indexi su obavezni.

### Acceptance criteria
- Svaka definisana osetljiva akcija pravi tačno jedan audit event.
- Audit i poslovna mutacija su atomski.
- Deleted resurs nije dostupan standardnim query-jima i može se restore-ovati.
- Tajne nisu prisutne u audit payload-u.

### Definition of Done
Opšti DoD; migration upgrade i permission/redaction testovi prolaze.

### Procena veličine
XL

### Validacija nakon implementacije
MySQL migration/integration suite, security matrix, frontend test/build; ručno
create→delete→list→restore i pregled audit zapisa.

## Stage 8 — Idempotency i konkurentnost za sve kritične mutacije

### Status prioriteta
OBAVEZNO

### Cilj
Postojeći idempotency/locking mehanizmi postaju precizni pod paralelnim
zahtevima i proširuju se samo na kritične create/transition operacije.

### Poslovna vrednost
Sprečava duple narudžbine/termine i izgubljene statusne izmene.

### Tehničko obrazloženje
Filter + `REQUIRES_NEW` postoji, ali zahteva real-DB concurrency, principal
scope, canonical request hash i jasnu retry semantiku.

### Preduslovi
Stage 3–5.

### Trenutno stanje
Idempotency za POST orders/reservations, response replay, TTL cleanup i
`@Version` na entitetima.

### Gap analiza
Key scope nije vezan za principal, hash raw body zavisi od JSON reprezentacije,
in-progress vraća generički conflict, nema load/concurrency matrice.

### Obim
Principal+operation scope, canonical payload/fingerprint, atomic reservation,
replay headers/status, transition preconditions i real MySQL concurrency testovi.

### Van obima
Distributed lock, payment i generička idempotency svih PUT/PATCH zahteva.

### Backend zadaci
Premestiti semantiku bliže application use case-u/interceptoru gde je potrebno;
definisati recovery posle process crash-a.

### Frontend zadaci
Stabilan UUID key po user action-u, čuvanje do ishoda, sprečavanje double-submit
i konflikt UI bez automatskog opasnog retry-a.

### Database zadaci
Promena unique scope-a i request metadata kroz novu migraciju; bez brisanja
aktivnih ključeva.

### API promene
Dokumentovati `Idempotency-Key`, replay indikator i 409/422/425 odluku.

### Security zahtevi
Jedan korisnik ne može replay-ovati odgovor drugog; response cache ne sadrži
nepotrebne tajne.

### UX zahtevi
Submit state je vidljiv; retry posle network greške koristi isti key; stvarni
conflict traži refresh.

### Testovi
Paralelni isti/different payload, cross-user key, crash recovery, optimistic
transition i frontend retry/double-click.

### Observability
Counter-i new/replay/conflict/in-progress/expired i lock latency.

### Dokumentacija
Idempotency contract i client algorithm.

### Verovatno pogođeni fajlovi i moduli
`gm/idempotency/`, order/reservation service/controller, migracija,
frontend order/reservation API/pages.

### Breaking changes
Isti key drugog principal-a menja semantiku; dokumentovana security korekcija.

### Migraciona strategija
Nova scope kolona nullable/backfill pa novi unique index; stari ključevi isteknu.

### Rizici
Transakcione granice mogu izazvati deadlock; load test i timeout politika.

### Acceptance criteria
- 20 paralelnih istih zahteva pravi jednu poslovnu operaciju.
- Različit payload/cross-user isti key ne vraća tuđ rezultat.
- Crash/in-progress zapis se deterministički oporavlja.
- Stale version vraća stabilan 409 bez izgubljene izmene.

### Definition of Done
Opšti DoD; real MySQL concurrency suite je stabilan višestrukim pokretanjem.

### Procena veličine
L

### Validacija nakon implementacije
`clean verify -Pmysql-it`; namenski concurrency test ponoviti više puta;
frontend test/build i ručni network retry scenario.

---

## Phase 3 — Testiranje i automatizacija

## Stage 9 — Testna piramida i E2E/a11y osnova

### Status prioriteta
OBAVEZNO

### Cilj
Repozitorijum dobija jasne unit/integration/component/E2E slojeve sa stabilnim
fixture-ima i merljivim coverage pragom.

### Poslovna vrednost
Brže i sigurnije promene uz manje ručne regresije.

### Tehničko obrazloženje
Backend integracije postoje, ali nema komponentnog/E2E/accessibility safety neta.

### Preduslovi
Stage 3–5.

### Trenutno stanje
42 backend testa i mali Vitest utility/schema suite.

### Gap analiza
Nema React Testing Library/MSW, Playwright, axe, contract fixture-a ni coverage
politike.

### Obim
Test taxonomy, builders, DB cleanup, component harness, MSW, Playwright smoke za
četiri role, axe checks i praktični coverage pragovi.

### Van obima
Visual regression svih stranica i load test (Stage 14).

### Backend zadaci
Razdvojiti unit/slice/integration; fixture factories; eliminisati shared state i
flaky clock; test Clock injection gde vreme utiče.

### Frontend zadaci
Dodati Testing Library, user-event, MSW, Playwright i axe; test auth, navigaciju,
kritične create/status tokove i error stanja.

### Database zadaci
Test fixture/cleanup, bez produkcione šeme promene.

### API promene
Nema; E2E koristi javni API.

### Security zahtevi
Testovi koriste sintetičke tajne/podatke; negativni auth scenariji obavezni.

### UX zahtevi
Testirati keyboard tok, loading/empty/error/success i responsive smoke.

### Testovi
Ovaj stage uspostavlja navedene kategorije i minimalni regression suite.

### Observability
Test report/artifact bez tajni; screenshot/trace samo na E2E failure.

### Dokumentacija
`docs/testing/TEST_STRATEGY.md` i lokalne komande.

### Verovatno pogođeni fajlovi i moduli
`gm/pom.xml`, backend test support (nov), frontend `package*.json`,
`vite.config.ts`, `playwright.config.ts` (nov), `src/test/` (nov), E2E (nov).

### Breaking changes
Nema.

### Migraciona strategija
Postepeno postaviti početni prag na realni baseline, zatim ne dozvoliti pad.

### Rizici
E2E može biti flaky; stabilni data-testid samo gde semantika nije dovoljna.

### Acceptance criteria
- Kritični auth/order/reservation tokovi prolaze E2E.
- Reprezentativne stranice prolaze axe bez serious/critical nalaza.
- Component testovi proveravaju sva UX stanja shared komponenti.
- Coverage prag je zabeležen i enforce-ovan.

### Definition of Done
Opšti DoD; tri uzastopna E2E pokretanja prolaze.

### Procena veličine
XL

### Validacija nakon implementacije
Backend `clean verify` i MySQL IT; frontend lint/typecheck/unit/coverage/build;
`npx playwright test` na desktop i mobile projektu.

## Stage 10 — CI quality, security i artefakt pipeline

### Status prioriteta
OBAVEZNO

### Cilj
Svaki PR automatski prolazi build, test, migration, E2E i security quality gate,
a main grana proizvodi verzionisane artefakte.

### Poslovna vrednost
Smanjuje rizik merge-a neispravnog ili ranjivog koda.

### Tehničko obrazloženje
Repo nema CI/CD ni centralno dokazive rezultate.

### Preduslovi
Stage 1, 3, 9.

### Trenutno stanje
Lokalne Maven/npm komande; nema workflow-a.

### Gap analiza
Nema cache-a, dependency/SAST/secret scan-a, migration/E2E jobs, artefakata ni
branch zaštite.

### Obim
PR workflow, toolchain pin/cache, backend/frontend jobs, Testcontainers,
Playwright, dependency review, secret/SAST/image-ready scan, SBOM i artifacts.

### Van obima
Automatski production deploy (Stage 26).

### Backend zadaci
Dodati formatter/lint/static analysis sa stabilnom konfiguracijom.

### Frontend zadaci
CI izvršava lint/typecheck/test/build/E2E i uploaduje failure artifacts.

### Database zadaci
CI MySQL migration suite; nema šema promene.

### API promene
Nema.

### Security zahtevi
Minimalne workflow permissions, pinned actions, bez fork secret exposure-a,
dependency/secret/SAST scan.

### UX zahtevi
Accessibility smoke je blocking gate.

### Testovi
Svi Stage 9 suite-ovi; test workflow-a kroz PR/granu.

### Observability
Job summary sa test brojem/trajanjem; artifacts imaju retention.

### Dokumentacija
CI status/gates, branch protection, local parity i release artifact sadržaj.

### Verovatno pogođeni fajlovi i moduli
`.github/workflows/` (nov), formatter/lint config fajlovi, `pom.xml`,
`package.json`, Dependabot/Renovate config (nov).

### Breaking changes
Nema runtime; PR pravila postaju stroža.

### Migraciona strategija
Prvo non-blocking baseline za postojeći dug, zatim blocking sa dokumentovanim
pragom u istom stage-u.

### Rizici
Nezaključane actions/supply-chain i dugi suite; pinning i cache.

### Acceptance criteria
- Čist PR pokreće sve obavezne jobs i pada na namernoj grešci.
- Main proizvodi backend jar, frontend dist, SBOM i test izveštaje.
- Critical/high nalazi nemaju tihi bypass.
- Dokumentovane branch protection provere odgovaraju workflow imenima.

### Definition of Done
Opšti DoD; workflow je stvarno izvršen bar jednom, ne samo syntactically dodat.

### Procena veličine
L

### Validacija nakon implementacije
Lokalna parity skripta; workflow lint; stvarni PR run; pregled permissions,
cache i artefakata.

---

## Phase 4 — Pouzdanost, asinhroni procesi i observability

## Stage 11 — Domain events i transactional Outbox

### Status prioriteta
OBAVEZNO

### Cilj
Kritične poslovne promene emituju stabilne događaje i atomski ih upisuju u
outbox za pouzdane buduće consumere.

### Poslovna vrednost
Notifikacije, audit integracije i report refresh ne mogu se izgubiti posle
uspešne transakcije.

### Tehničko obrazloženje
Side-effect infrastruktura ne postoji; direktni async pozivi bi pravili dual
write problem.

### Preduslovi
Stage 2, 3, 7–10; ADR-10/11.

### Trenutno stanje
Sinhroni application servisi i scheduler samo za idempotency cleanup.

### Gap analiza
Nema event contracts, outbox schema, claim/retry/DLQ ni idempotent consumer API.

### Obim
Events za ključne auth/user/reservation/order promene, outbox tabela/writer,
polling publisher, retry/backoff/dead-letter i jedan dokazni idempotent consumer.

### Van obima
Kafka/RabbitMQ, full CQRS i business notification UI.

### Backend zadaci
Immutable versioned envelope, after-domain validation emission, atomic writer,
SKIP LOCKED/claim strategija primerena MySQL-u, graceful worker shutdown.

### Frontend zadaci
Nema korisničke funkcije; eventualno prikaz job health-a samo adminu nije deo.

### Database zadaci
Outbox i consumer receipt/dead-letter kolone/tabele, status/available_at indeks,
retention.

### API promene
Nema javnog API-ja.

### Security zahtevi
Event payload je minimalan, bez tokena/passworda; consumer authorization ne
veruje payload roli.

### UX zahtevi
Nema.

### Testovi
Atomic commit/rollback, concurrent claim, retry/backoff, poison event/DLQ,
consumer dedupe i migration.

### Observability
Pending/age/processed/failed/DLQ metrike i correlation ID.

### Dokumentacija
Event katalog, schema evolution i replay/runbook.

### Verovatno pogođeni fajlovi i moduli
Novi `gm/events/` i migracija; order/reservation/auth/user application servisi;
Actuator health/metrics.

### Breaking changes
Nema eksternih; event schema v1 postaje interni ugovor.

### Migraciona strategija
Deploy praznu tabelu/worker disabled, početi dual emit, uključiti worker,
monitorisati backlog.

### Rizici
Duplikati su očekivani; svaki consumer mora biti idempotentan.

### Acceptance criteria
- Commit poslovne promene i eventa je atomaran.
- Rollback ne ostavlja event.
- Restart/concurrency ne gubi event; duplikat nema dupli side effect.
- DLQ je vidljiv i replay kontrolisan.

### Definition of Done
Opšti DoD; failure injection testovi prolaze.

### Procena veličine
XL

### Validacija nakon implementacije
MySQL integration/concurrency suite, restart/failure injection, metrike backlog-a
i `clean verify`.

## Stage 12 — Background jobs, scheduler i pouzdani retry

### Status prioriteta
PREPORUČENO

### Cilj
Dugotrajni i periodični poslovi imaju zajednički model statusa, lease-a,
retry/backoff-a, otkazivanja i health-a.

### Poslovna vrednost
Omogućava pouzdane izveštaje, retention, notifikacije i obradu fajlova.

### Tehničko obrazloženje
Jedan `@Scheduled` cleanup nije dovoljan za multi-instance i operativni nadzor.

### Preduslovi
Stage 11.

### Trenutno stanje
Idempotency cleanup scheduler; nema job evidencije.

### Gap analiza
Nema lease/heartbeat, failure history, admin visibility ni graceful stop-a.

### Obim
DB-backed job framework za interne use-case-ove, bounded worker pool, timeout,
retry/backoff/jitter, dead state, cancellation i retention jobs.

### Van obima
External orchestrator, distributed queue i konkretan report/notification feature.

### Backend zadaci
Job API/runner/handler registry; clock/locking; cleanup za refresh/idempotency/
audit/outbox prema policy-ju.

### Frontend zadaci
Minimalan OWNER operational jobs pregled samo ako potreban za recovery.

### Database zadaci
Job/job_attempt schema i indeksi due/status/lease; migration/backfill nije potreban.

### API promene
Opcioni OWNER-only `/api/v1/operations/jobs` read/retry/cancel.

### Security zahtevi
Handler payload redigovan/enkriptovan po potrebi; admin operacije auditovane.

### UX zahtevi
Status, progress, failure-safe poruka i eksplicitni retry/cancel state.

### Testovi
Clock, lease expiry, dva runner-a, timeout, backoff, cancellation, graceful
shutdown i permissions.

### Observability
Queue depth, oldest age, duration, attempts/failures/dead, worker health.

### Dokumentacija
Handler contract, retry matrica i operations runbook.

### Verovatno pogođeni fajlovi i moduli
Novi `gm/jobs/`, migracija, idempotency/auth/audit cleanup, application config,
eventualni frontend operations page.

### Breaking changes
Nema.

### Migraciona strategija
Prebaciti postojeći cleanup tek nakon parity testa; jedan scheduler owner tokom
prelaza.

### Rizici
Dupli runner i stuck lease; DB vreme i fencing/claim uslovi moraju biti testirani.

### Acceptance criteria
- Dve instance ne izvršavaju isti attempt istovremeno.
- Stuck lease se oporavlja bez gubitka.
- Retry/timeout/cancel su deterministični i merljivi.
- Shutdown prestaje da claim-uje i završava/oslobađa rad.

### Definition of Done
Opšti DoD; multi-runner test i health indicator prolaze.

### Procena veličine
L

### Validacija nakon implementacije
MySQL two-runner integration test, failure injection, shutdown test, metrics/
health pregled, backend/frontend build ako UI postoji.

## Stage 13 — Produkcioni observability baseline

### Status prioriteta
OBAVEZNO

### Cilj
Logovi, metrike, health/probe i alert pravila omogućavaju brzo otkrivanje i
dijagnozu kvara bez izlaganja podataka.

### Poslovna vrednost
Smanjuje vreme prekida i daje merljive SLO signale.

### Tehničko obrazloženje
Actuator/request ID postoje, ali nema scrape, dashboard, alert ili strukturirane
log politike.

### Preduslovi
Stage 10–12; ADR-13/14.

### Trenutno stanje
Health/info/metrics, request ID/MDC i generičan 500.

### Gap analiza
Nema JSON loga, Prometheus endpointa, readiness/liveness grupa, Grafane, alert
pravila, job/outbox health-a ni privacy testova.

### Obim
Structured logging, correlation propagation, Micrometer custom metriке,
Prometheus, health groups, Grafana dashboards, alert rules i Sentry odluka.

### Van obima
Distributed tracing bez spoljne granice i 24/7 on-call organizacija.

### Backend zadaci
Log schema/redaction, request timer/error tags sa bounded cardinality, DB/outbox/
job health, graceful shutdown.

### Frontend zadaci
Global error reporting adapter sa release/request ID kontekstom i redakcijom;
bez slanja form sadržaja.

### Database zadaci
Nema šema promene.

### API promene
Management endpoints mrežno zaštićeni; liveness/readiness paths dokumentovani.

### Security zahtevi
Metrics/health details nisu javni; tokeni/PII nisu u log/tag/error payload-u.

### UX zahtevi
Korisniku ostaje request ID i stabilna generička poruka.

### Testovi
Log redaction, request ID propagation, metric cardinality, probe failure i
frontend error adapter.

### Observability
Ovo je primarni sadržaj: latency/error/rate/saturation, DB pool, auth/rate
limit, outbox/jobs i business throughput dashboardi.

### Dokumentacija
Signal katalog, SLO početne vrednosti, dashboard/alert/runbook.

### Verovatno pogođeni fajlovi i moduli
`gm/pom.xml`, application-prod config, common filter/error, metrics config,
`ops/prometheus/` i `ops/grafana/` (nov), frontend error boundary.

### Breaking changes
Management endpoint exposure/config može se promeniti; javni API ne.

### Migraciona strategija
Emitovati stare i nove logove kratko samo ako collector to zahteva; dashboards
prvo, alerts nakon baseline-a.

### Rizici
High-cardinality UUID/email tagovi i PII leakage; automatizovani testovi.

### Acceptance criteria
- Jedan request se koreliše kroz backend/event/job bez tajni.
- Prometheus scrapes potrebne bounded metrike.
- Readiness pada za kritičnu DB zavisnost, liveness ne pravi restart loop.
- Test alert se aktivira i linkuje runbook.

### Definition of Done
Opšti DoD; dashboard/alert artefakti se validiraju u lokalnom ops stacku.

### Procena veličine
L

### Validacija nakon implementacije
Backend/frontend suite; `docker compose` ops profile; Prometheus targets/rules
check; probe i test-alert failure injection; pretraga loga za test secret.

## Stage 14 — Performance baseline, query tuning i load test

### Status prioriteta
PREPORUČENO

### Cilj
Kritični tokovi imaju merene budžete, profilisane SQL upite i ponovljiv load test.

### Poslovna vrednost
Predvidiv odziv pri rastu bez spekulativnog cache-a.

### Tehničko obrazloženje
Indeksi/agregati postoje, ali nema EXPLAIN/load/bundle budžeta ni N+1 zaštite.

### Preduslovi
Stage 3, 10, 13; ADR-12.

### Trenutno stanje
EntityGraph za order items, indeksi i dashboard DB agregati; lazy dashboard.

### Gap analiza
Nema query count testa, slow-query procedure, k6 scenarija, connection-pool
tuninga ili frontend bundle budžeta.

### Obim
Realističan dataset, query profiling/index korekcije, pagination granice,
Hikari/timeouts, k6 auth/list/create/dashboard scenariji i Vite budgets.

### Van obima
Redis/full-text/global search i horizontalno skaliranje.

### Backend zadaci
Otkloniti potvrđene N+1/spore upite, batch gde merljivo, timeout politika za DB/
buduće spoljne pozive.

### Frontend zadaci
Route code splitting, bundle analiza, image sizing/lazy loading i virtualizacija
samo potvrđeno velikih listi.

### Database zadaci
Aditivne indekse kroz Flyway na osnovu EXPLAIN-a; dokumentovati write cost.

### API promene
Cursor pagination samo ako offset test ne zadovolji budžet; tada aditivno.

### Security zahtevi
Load test ne zaobilazi auth/rate limit bez posebnog test profila.

### UX zahtevi
Definisati p95 budžete i loading feedback za spore operacije.

### Testovi
Query-count regression, large dataset integration, k6 smoke/load i bundle budget.

### Observability
p50/p95/p99, error rate, pool saturation, query duration i frontend Web Vitals.

### Dokumentacija
Performance baseline, dataset, pragovi i DB maintenance preporuke.

### Verovatno pogođeni fajlovi i moduli
Repositories/specifications, migracije, datasource config, frontend routes/
assets, `performance/k6/` (nov), CI.

### Breaking changes
Nema planirano.

### Migraciona strategija
Online-capable index strategija; pre/posle merenje i roll-forward rollback.

### Rizici
Nerealan dataset daje lažan rezultat; production-shaped anonimizovan model.

### Acceptance criteria
- Kritični endpoint-i zadovoljavaju dokumentovan p95/error prag.
- Nema potvrđenog N+1 u list/detail tokovima.
- Connection pool ne saturira na ciljnom opterećenju.
- Frontend initial/route bundle je ispod budžeta.

### Definition of Done
Opšti DoD; izveštaj sadrži reproduktivne pre/posle rezultate.

### Procena veličine
L

### Validacija nakon implementacije
MySQL EXPLAIN/test suite, `k6 run` smoke/load, frontend analyze/build budget,
Prometheus/Grafana pregled tokom testa.

---

## Phase 5 — UX, design system i pristupačnost

## Stage 15 — Design system i osnovna UX stanja

### Status prioriteta
OBAVEZNO

### Cilj
Repo-native design tokeni i pristupačne shared komponente standardizuju layout,
forme, tabele, feedback i responsive ponašanje.

### Poslovna vrednost
Brži svakodnevni rad i manje nedoslednosti/grešaka korisnika.

### Tehničko obrazloženje
CSS vizuelna osnova postoji, ali page komponente dupliraju pattern-e.

### Preduslovi
Stage 9.

### Trenutno stanje
Globalni CSS, panel/card/table klase, role nav i pojedinačni banner-i.

### Gap analiza
Nema tokena, komponentnog kataloga, toast/skeleton/empty/modal/drawer standarda,
tema/density ni mobile navigation.

### Obim
Tokens, typography/spacing/grid/semantic colors, Button/Input/Select/FormField/
Card/Table shell/Modal/Drawer/Toast/Skeleton/Empty/Error/PageHeader/Breadcrumb,
light/dark i responsive shell.

### Van obima
Kompletan redizajn svake business stranice i drag/drop dashboard.

### Backend zadaci
Nema osim očuvanja error metadata potrebnog feedback-u.

### Frontend zadaci
Izgraditi komponente, theme/density preference, mobile nav, standard focus/
disabled/error/loading/success; migrirati auth i jednu reprezentativnu CRUD
stranu kao dokaz.

### Database zadaci
Nisu potrebni; preference lokalno do Stage 19/25 ako se sinhronizuje.

### API promene
Nema.

### Security zahtevi
Toast/error ne prikazuje server interne detalje; modal ne zaobilazi permission.

### UX zahtevi
Skeleton bez layout shift-a; empty nudi relevantnu akciju; potvrda samo za
destruktivno; responsive 320px+; reduced motion hook.

### Testovi
Component interaction/a11y, theme/density persistence, responsive Playwright i
visual snapshot reprezentativnih komponenti.

### Observability
Frontend error boundary ostaje; bez analytics-a korisničkog sadržaja.

### Dokumentacija
Component usage, tokens, content/style guide.

### Verovatno pogođeni fajlovi i moduli
Novi `frontend/src/components/`, `styles/tokens.css`, layout/App CSS, auth i jedna
CRUD page, Storybook ili lagan docs harness (nov, odluka u stage-u).

### Breaking changes
Nema API promena; vizuelna promena UI-ja.

### Migraciona strategija
Komponente se uvode paralelno, zatim stranice migriraju stage po stage.

### Rizici
Preveliki component API; krenuti od stvarnih postojećih obrazaca.

### Acceptance criteria
- Sve definisane komponente imaju loading/error/disabled/focus ponašanje.
- Light/dark i compact/comfortable ne lome 320px prikaz.
- Auth i izabrani CRUD više ne dupliraju primitive.
- Component/a11y/visual testovi prolaze.

### Definition of Done
Opšti DoD; nema placeholder design-system komponenti.

### Procena veličine
XL

### Validacija nakon implementacije
Frontend lint/typecheck/unit/build, Playwright desktop/mobile, axe i visual
snapshots; backend contract smoke.

## Stage 16 — WCAG 2.2 AA pristupačnost

### Status prioriteta
OBAVEZNO

### Cilj
Svi postojeći ključni tokovi su upotrebljivi tastaturom, screen readerom,
zoom-om i reduced-motion podešavanjem.

### Poslovna vrednost
Sistem je dostupan širem broju korisnika i pouzdaniji za sve.

### Tehničko obrazloženje
Osnovne label/alert oznake postoje, ali nema audita ni chart/table alternative.

### Preduslovi
Stage 15.

### Trenutno stanje
Semantičke forme/tabele delimično; nekoliko `role=alert/status`.

### Gap analiza
Nema skip linka/focus managementa, dijalog semantike, kontrast/zoom/reduced
motion provere, live region standarda ni a11y grafikona.

### Obim
WCAG audit svih MVP ruta, popravke, keyboard/focus, accessible names, status
announcements, table/chart fallback i automated/manual checklist.

### Van obima
Formalna pravna sertifikacija.

### Backend zadaci
Error/validation payload mora omogućiti povezivanje grešaka sa poljima.

### Frontend zadaci
Semantički landmarks/headings, skip link, route focus/title, modal trap/restore,
ARIA samo gde native HTML nije dovoljan, reduced motion i 200% zoom.

### Database zadaci
Nisu potrebni.

### API promene
Nema novih osim već aditivnih field errors iz Stage 4.

### Security zahtevi
Accessible poruke ne otkrivaju više podataka od vizuelnih.

### UX zahtevi
WCAG 2.2 AA za login, katalog, profile, user, reservation, order, settings i
dashboard tokove; grafikon ima tekst/tabelu.

### Testovi
axe component/E2E, keyboard-only Playwright, focus assertions, contrast/manual
screen reader checklist.

### Observability
A11y CI rezultat i trend; bez prikupljanja disability podataka.

### Dokumentacija
Accessibility statement, known limitations i manual test protocol.

### Verovatno pogođeni fajlovi i moduli
Sve frontend pages/layout/shared components/styles i a11y tests; API error DTO
ako Stage 4 nije dovoljan.

### Breaking changes
Nema.

### Migraciona strategija
Ruta po ruta; critical/serious nalazi blokiraju completion.

### Rizici
Automatski alati ne otkrivaju sve; obavezna ručna tastatura/screen-reader provera.

### Acceptance criteria
- Nema axe critical/serious nalaza na MVP rutama.
- Svaka funkcija radi keyboard-only uz vidljiv fokus.
- 200% zoom/320px ne gubi sadržaj ili akcije.
- Grafikoni imaju razumljiv tabelarni fallback i opis metrike.

### Definition of Done
Opšti DoD; ručna checklist-a je potpisana rezultatima.

### Procena veličine
L

### Validacija nakon implementacije
Unit/axe/Playwright suite, keyboard walkthrough, NVDA/VoiceOver smoke, 200% zoom
i prefers-reduced-motion provera.

## Stage 17 — Napredne forme, tabele, filteri i saved views

### Status prioriteta
PREPORUČENO

### Cilj
Operativne liste i forme dobijaju URL-state filtere, doslednu validaciju,
očuvanje unosa, bulk/inline akcije gde su bezbedne i saved views.

### Poslovna vrednost
Smanjuje klikove i vreme rada nad rezervacijama, narudžbinama, katalogom i
korisnicima.

### Tehničko obrazloženje
Stranice ručno ponavljaju state/fetch/form obrasce i filteri se gube navigacijom.

### Preduslovi
Stage 4, 5, 15–16.

### Trenutno stanje
Paginacija/filteri i forme postoje, ali uglavnom kroz lokalni `useState`.

### Gap analiza
Nema URL state-a, React Query standarda, dirty guard-a, saved view-a, bulk
permission modela ni virtualizacije velikih lista.

### Obim
TanStack Query keys/cache/invalidation, URL filter/sort/page, shared data table/
form patterns, saved views, recent filters, safe bulk status/activation.

### Van obima
Global cross-entity search (Stage 18) i offline mutations.

### Backend zadaci
Allow-listed multi-sort/filter; bulk endpoint-i samo za atomske ili per-item
jasno izveštene operacije; saved-view API ako se sinhronizuje.

### Frontend zadaci
Migrirati glavne liste/forme, focus first error, server-error preservation,
dirty warning, double-submit guard, optional autosave draft za duže forme.

### Database zadaci
Saved view tabela owner/type/query JSON/version; indeksi owner/type. Bez
denormalizovanih filter tabela.

### API promene
Aditivni saved-view CRUD i pažljivo definisani bulk endpoint-i.

### Security zahtevi
Filter/sort injection allow-list; svaka bulk stavka proverava permission/
resource; view pripada korisniku.

### UX zahtevi
Loading skeleton, empty/error/retry, selected count, partial failure summary,
responsive table→card strategija i keyboard table akcije.

### Testovi
Query cache/invalidation, URL restore, dirty form, bulk authorization/atomicity,
saved-view ownership i large-list performance.

### Observability
Bulk size/duration/failure count bez item PII; query latency po resource tipu.

### Dokumentacija
Table/form/filter konvencije i bulk API.

### Verovatno pogođeni fajlovi i moduli
Frontend pages/api/components/query hooks; backend controllers/specifications,
nov preferences/savedview modul i migracija.

### Breaking changes
Nema; postojeći single-item endpoint-i ostaju.

### Migraciona strategija
Migrirati jednu po jednu stranicu; stari query parametri ostaju podržani.

### Rizici
Bulk parcijalni uspeh može zbuniti; ugovor mora eksplicitno izabrati atomic ili
multi-status ponašanje po akciji.

### Acceptance criteria
- Refresh/back zadržava filter, sort, page i fokusni kontekst.
- Server error ne briše formu; dirty navigacija upozorava.
- Saved views su privatni i version-safe.
- Bulk akcije ne zaobilaze resource permission i jasno prikazuju ishod.

### Definition of Done
Opšti DoD; sve četiri operativne liste koriste shared pattern.

### Procena veličine
XL

### Validacija nakon implementacije
Backend integration/security suite; frontend component/E2E/a11y/build; ručni
back/refresh/deep-link i bulk partial-failure scenariji.

---

## Phase 6 — Napredna produktivnost i vizuelizacija

## Stage 18 — Global search, command palette i produktivnost

### Status prioriteta
PREPORUČENO

### Cilj
Korisnik brzo pronalazi dozvoljene resurse i izvršava role-aware navigacione
akcije kroz global search/command palette.

### Poslovna vrednost
Smanjuje vreme traženja kroz rastući sistem.

### Tehničko obrazloženje
Postoje samo lokalni filteri; nema jedinstvenog search contract-a.

### Preduslovi
Stage 5, 14, 17.

### Trenutno stanje
Catalog/user specifications i role nav.

### Gap analiza
Nema cross-entity indeksa/query-ja, permission-filtered rezultata, recents/
favorites ni keyboard palette.

### Obim
Search korisnika/kataloga/orders/reservations prema roli, grouped results,
debounce/cancel, command palette, keyboard shortcuts, recent items/favorites.

### Van obima
Natural-language/AI search i eksterni search engine bez potrebe.

### Backend zadaci
Search facade vraća minimalne projection DTO, permission scope i capped
rezultate; MySQL FULLTEXT samo ako LIKE ne zadovolji merenje.

### Frontend zadaci
`Ctrl/Cmd+K`, accessible combobox/dialog, grouped results, recent/favorite,
deep-link uz očuvan povratni kontekst.

### Database zadaci
Po merenju FULLTEXT/normalizovani indeksi; recent/favorite tabela sa owner FK.

### API promene
Novi `/api/v1/search` i recent/favorites CRUD.

### Security zahtevi
Permission filter pre rank/return; nema count/preview side-channel-a za
nedozvoljene resurse; rate limit.

### UX zahtevi
Keyboard-first, loading/empty/error, highlight bez XSS, mobile search sheet.

### Testovi
Permission leakage, ranking/filtering, injection/abuse, debounce/cancel,
keyboard/a11y i performance.

### Observability
Latency/zero-result/error; query tekst se ne loguje sirov.

### Dokumentacija
Search scope, ranking, shortcut mapa i privacy.

### Verovatno pogođeni fajlovi i moduli
Novi backend `search/`, repository projections/migracije, frontend search/
command components, AppShell, routes.

### Breaking changes
Nema.

### Migraciona strategija
Početi sa indeksiranim DB query-jima; engine abstraction tek uz mereni limit.

### Rizici
Search je authorization side-channel; negativni testovi su obavezni.

### Acceptance criteria
- Rezultati nikad ne sadrže nedozvoljen resurs/metadata.
- p95 zadovoljava Stage 14 budžet na ciljnom datasetu.
- Palette radi tastaturom i screen readerom.
- Recents/favorites su korisnički izolovani.

### Definition of Done
Opšti DoD; search abuse/security/load suite prolazi.

### Procena veličine
L

### Validacija nakon implementacije
MySQL search/performance/security tests, frontend component/E2E/axe/build,
manual role-by-role palette.

## Stage 19 — Poslovni dashboard i pristupačne vizualizacije

### Status prioriteta
PREPORUČENO

### Cilj
Dashboard prikazuje merljive trendove, poređenje perioda i operativno
opterećenje sa drill-down-om i tabelarnim fallbackom.

### Poslovna vrednost
Vlasnik planira kapacitet/prihod, a zaposleni prioritizuje današnji rad.

### Tehničko obrazloženje
Postoje tri management KPI-ja i operativne kartice, ali grafikoni imaju malu
analitičku vrednost i nisu pristupačni.

### Preduslovi
Stage 5, 13–18; ADR-16.

### Trenutno stanje
Agregatni summary/today endpoint-i, Recharts pie/bar i period filter.

### Gap analiza
Nema trend bucket-a, prethodnog perioda, apsolutne/% promene, workload/
attendance/capacity definicija, drill-down/export/personalizacije.

### Obim
Dokumentovane metrike; revenue/order/reservation trend; status distribution;
employee workload/capacity iz dostupnih rezervacija/radnog vremena; period/team/
employee filter; drill-down; CSV; widget layout/preferences.

### Van obima
Payroll, formalno prisustvo/kašnjenje/prekovremeno dok nema attendance domena;
takvi grafikoni se eksplicitno označavaju blokiranim, ne izmišljaju.

### Backend zadaci
Projection/read services sa timezone-safe bucketima, previous-period i
permission-sensitive metrics; bounded date ranges.

### Frontend zadaci
KPI trend, line/bar/stacked/heatmap samo gde metrika postoji; tooltip definicije,
goal/threshold opcija, responsive/table fallback, drill-down i saved layout.

### Database zadaci
Indeksi/read projection samo prema EXPLAIN-u; preference/widget tabela; bez
dekorativno denormalizovanih podataka.

### API promene
Aditivni `/dashboard/trends`, `/workload`, `/export` i widget preferences.

### Security zahtevi
Osetljive finansijske/team metrike po permissions; export isti scope kao ekran.

### UX zahtevi
No/partial data, timezone/period label, accessible palette, tabelarni fallback,
responsive i export raw/view.

### Testovi
Metric definition/boundary/timezone, authorization, aggregate SQL, chart
component/a11y, drill-down i export.

### Observability
Query/export latency, range size, cache hit samo ako cache uveden merenjem.

### Dokumentacija
Metric dictionary sa formulom, zonom, grain-om i vlasnikom; chart decision guide.

### Verovatno pogođeni fajlovi i moduli
`gm/dashboard/`, repositories/projections/migracije, frontend dashboard/types/
charts/preferences, export utility.

### Breaking changes
Nema; postojeći summary/today ostaju.

### Migraciona strategija
Novi endpoint-i i widgeti aditivno; postojeći dashboard migrira postepeno.

### Rizici
Pogrešna metrika vodi lošoj odluci; definicije i test fixture očekivanja su
obavezni.

### Acceptance criteria
- Svaki grafikon ima poslovnu definiciju, empty/partial i tabelarni fallback.
- Period comparison je matematički i timezone tačan.
- Drill-down zbir odgovara agregatu za isti filter.
- Permissions važe identično za UI, API i export.

### Definition of Done
Opšti DoD; nema attendance/AI/dekorativne metrike bez izvora podataka.

### Procena veličine
XL

### Validacija nakon implementacije
Backend aggregate/MySQL/performance/security suite; frontend component/E2E/axe/
visual/build; ručno poređenje fixture SQL podataka, drill-down i CSV.

---

## Phase 7 — Notifikacije, dokumenti, izveštaji i workflow

## Stage 20 — Jedinstvene notifikacije i real-time isporuka

### Status prioriteta
PREPORUČENO

### Cilj
Outbox događaji proizvode deduplikovane in-app notifikacije, preference i
real-time notification center; email je pouzdan adapter.

### Poslovna vrednost
Korisnici pravovremeno saznaju za promene termina/narudžbina bez ručnog refresh-a.

### Tehničko obrazloženje
Nema notification modela; Stage 11/12 daje pouzdanu osnovu.

### Preduslovi
Stage 5–7, 11–13, 15–16; ADR-17.

### Trenutno stanje
Potpuno odsutno.

### Gap analiza
Nema type/template/preference/read/dedupe/delivery/history/deep-link modela.

### Obim
In-app inbox, read/unread/grouping, priority, preferences, template/localization,
SSE reconnect/replay i email adapter sa retry/history.

### Van obima
Push i SMS (budući adapteri), collaborative presence i bidirectional WebSocket.

### Backend zadaci
Event consumer, notification/delivery service, SSE auth/heartbeat/Last-Event-ID,
email sandbox adapter i deep-link policy.

### Frontend zadaci
Bell/unread count, notification center, preference page, optimistic read uz
rollback, SSE reconnect i polling fallback.

### Database zadaci
Notification, preference, delivery attempt/template tabela i recipient/status/
created indeksi; retention.

### API promene
List/read/read-all/preferences/SSE endpoint-i; stable notification type contract.

### Security zahtevi
Recipient/resource permission ponovo proveriti pri otvaranju; SSE token/cookie
model bez URL tajne; template injection zaštita.

### UX zahtevi
Grouped/deduped, relative+absolute vreme, empty/offline/reconnecting state,
accessible live announcements bez spam-a.

### Testovi
Outbox consumer dedupe, preference/channel, retry/DLQ, SSE reconnect/auth,
template escaping, component/E2E/a11y.

### Observability
Created/delivered/failed/age/SSE connections/reconnects; delivery history.

### Dokumentacija
Notification type katalog, template/localization i delivery runbook.

### Verovatno pogođeni fajlovi i moduli
Novi `gm/notification/`, migrations/jobs/events/security; frontend notification
API/store/components/pages/AppShell.

### Breaking changes
Nema.

### Migraciona strategija
In-app prvo, SSE zatim, email poslednji feature-flagged; event replay backfill
nije podrazumevan.

### Rizici
Notification storm/duplicate/privacy; dedupe key, preference i rate cap.

### Acceptance criteria
- Jedan domain event proizvodi najviše jednu notifikaciju po recipient/type.
- Preference se poštuju; obavezni security događaji se ne mogu nejasno isključiti.
- SSE reconnect ne gubi niti duplira stanje.
- Email failure ne rollback-uje poslovnu transakciju i ide kroz retry/DLQ.

### Definition of Done
Opšti DoD; delivery failure/reconnect testovi prolaze.

### Procena veličine
XL

### Validacija nakon implementacije
Backend event/job/SSE/security suite; frontend E2E sa reconnect-om; email sandbox;
metrics/DLQ pregled.

## Stage 21 — Bezbedni dokumenti i object-storage spremnost

**Izvršni status: DONE (2026-08-10).** Uvedeni su privatni verzionisani
dokumenti, karantin i skeniranje, local/S3 storage ugovor, autorizovani
download, audit/metrics, migracioni ledger za postojeće medije i kompletan UI
tok. Backend clean verify i sve frontend provere prolaze.

### Status prioriteta
PREPORUČENO

### Cilj
Dokumenti imaju metadata, verzije, permissions, quarantine/scan, privatni
download i storage abstraction.

### Poslovna vrednost
Omogućava bezbedno čuvanje priloga uz korisnike/workflow/report tokove.

### Tehničko obrazloženje
Trenutni lokalni image upload je javni, bez metadata/version/audit/storage scale.

### Preduslovi
Stage 5, 7, 11–13; ADR-18/19.

### Trenutno stanje
PNG/JPEG magic/MIME/size/path validacija i lokalni `/media/**`.

### Gap analiza
Nema privatnog authorization download-a, versioning-a, checksum-a, quarantine-a,
malware scan-a, object storage-a ni download audita.

### Obim
Document aggregate/version/metadata/links, storage port local+S3-compatible,
streaming upload, quarantine scan job, preview supported types i download audit.

### Van obima
OCR/AI, kompleksan editor i javni file sharing.

### Backend zadaci
Signed/internal object keys, content-disposition, MIME allow-list, checksum,
scan state, permission policy i delete retention.

### Frontend zadaci
Accessible uploader/progress/error/retry, version list, preview/fallback,
permission-aware download.

### Database zadaci
Document/version/link/scan metadata; indeks owner/resource/status; object nije DB
blob.

### API promene
Upload init/complete ili multipart, list/version/download/metadata/delete/restore.

### Security zahtevi
Path traversal, MIME polyglot, size/count quota, malware quarantine, private
authorization svaki download, no-sniff i audit.

### UX zahtevi
Progress/cancel, scan pending/rejected, preview unavailable, responsive list i
keyboard upload.

### Testovi
Genuine/fake MIME, traversal, oversized/quota, unauthorized download, version
race, scanner failure, storage contract i E2E.

### Observability
Upload bytes/duration/failure, scan age/result, storage errors bez filename PII.

### Dokumentacija
Supported formats/limits, storage migration, incident/delete/restore runbook.

### Verovatno pogođeni fajlovi i moduli
Refactor `gm/media/` u document/storage module, migrations/jobs/audit/security,
frontend document components/API.

### Breaking changes
Javni avatar/catalog URLs mogu preći na kontrolisane ili signed URL; obezbediti
compatibility redirect/period.

### Migraciona strategija
Inventarisati postojeće lokalne fajlove, dual-read, copy/checksum, switch-write,
pa ukloniti public path tek nakon verifikacije.

### Rizici
Malware, storage orphan-i i broken links; quarantine, reconciliation job i audit.

### Acceptance criteria
- Nedozvoljen korisnik ne može dobiti sadržaj ni metadata.
- Fajl nije dostupan pre uspešnog scan-a.
- Storage contract prolazi local i S3-compatible implementaciju.
- Migracija postojećih slika je proverljiva checksum-om.

### Definition of Done
Opšti DoD; security upload suite i reconciliation prolaze.

### Procena veličine
XL

### Validacija nakon implementacije
Storage contract/integration/security tests, malware test corpus bez aktivnog
malware-a, frontend E2E/a11y, object-store local stack i migration dry-run.

## Stage 22 — Asinhroni izveštaji i eksport

### Status prioriteta
PREPORUČENO

### Cilj
Permission-safe CSV/XLSX/PDF izveštaji se generišu u pozadini, imaju status,
preuzimanje, template i schedule.

### Poslovna vrednost
Vlasnik dobija operativne/finansijske podatke bez blokiranja aplikacije.

### Tehničko obrazloženje
Dashboard export nije report engine; jobs/documents sada daju potrebnu osnovu.

### Preduslovi
Stage 12–14, 19, 21; ADR-20.

### Trenutno stanje
Nema report engine-a ni export-a osim planiranog dashboard CSV-a.

### Gap analiza
Nema template/snapshot/schedule/status/file retention/permission modela.

### Obim
Report definitions za orders/reservations/revenue/workload, request snapshot,
CSV streaming, XLSX/PDF, background status/progress, scheduled reports i audit.

### Van obima
Ad-hoc SQL builder za korisnika i AI narrative.

### Backend zadaci
Report registry/query projections, job handler, bounded memory, locale/timezone,
document output i permission snapshot + download recheck.

### Frontend zadaci
Report catalog/form, validation, progress/history, download/expiry, schedule UI.

### Database zadaci
Report request/schedule/template metadata i indeksi owner/status/next_run.

### API promene
Report definitions, generate, status/list/download/cancel i schedules CRUD.

### Security zahtevi
Row-level permission u query-ju i pri download-u; formula injection zaštita u
CSV/XLSX; audit generate/download.

### UX zahtevi
Estimated scope, queued/progress/failed/expired, notification on completion,
accessible tables i timezone/metric definitions.

### Testovi
Golden data CSV/XLSX/PDF structure, permission leakage, formula injection, large
dataset memory, retry/cancel/schedule timezone i E2E.

### Observability
Queue/duration/rows/bytes/failure/expiry; bez report sadržaja u logu.

### Dokumentacija
Report catalog/definitions, format limitations i operations runbook.

### Verovatno pogođeni fajlovi i moduli
Novi `gm/report/`, jobs/documents/notification/audit, migrations/dependencies,
frontend reports pages/API.

### Breaking changes
Nema.

### Migraciona strategija
Jedan report po iteraciji unutar stage-a, zajednički engine kompletan; feature
flag do load verifikacije.

### Rizici
Memory/CPU i podatak koji se promeni tokom generisanja; streaming i jasno
snapshot vreme.

### Acceptance criteria
- Report podaci odgovaraju API metric/filter definiciji.
- Veliki export ostaje unutar memory/performance budžeta.
- Unauthorized row/download i spreadsheet injection testovi prolaze.
- Scheduled report poštuje poslovnu zonu i DST.

### Definition of Done
Opšti DoD; sva tri formata i failure/cancel/expiry tok rade.

### Procena veličine
XL

### Validacija nakon implementacije
Backend golden/security/load/job tests, otvoriti PDF/XLSX/CSV standardnim
alatima, frontend E2E/a11y, metrics pregled.

## Stage 23 — Approval workflow i poslovna automatizacija

### Status prioriteta
OPCIONO

### Cilj
Jedan stvaran approval use case dobija konfigurabilne korake, dozvoljene
tranzicije, rokove, komentare, priloge, odluke i audit.

### Poslovna vrednost
Formalizuje odobravanje bez email/spreadsheet improvizacije.

### Tehničko obrazloženje
Postoje hardkodovane state machine tranzicije; generički engine nije opravdan
bez konkretnog approval procesa.

### Preduslovi
Stage 5, 7, 11–13, 20–22; ADR-21 i potvrđen poslovni use case.

### Trenutno stanje
Order/reservation status pravila, bez approval instance/modela.

### Gap analiza
Nema definicije, instance, step assignment, SLA/reminder/escalation/comment.

### Obim
Minimalni workflow engine za izabrani use case, versioned definition, transitions,
role/permission conditions, due/reminder/escalation, comments/attachments/history.

### Van obima
Visual BPMN designer, proizvoljan skriptni kod i zamena order/reservation state
machine bez dokazane koristi.

### Backend zadaci
Definition validator, instance/step service, transition policy, jobs/events/
notifications i immutable decision history.

### Frontend zadaci
Inbox, detail/timeline, approve/reject/return with reason, comments/attachments,
admin definition form ograničen na podržane primitives.

### Database zadaci
Workflow definition/version/instance/step/decision/comment/link tabele i indeksi.

### API promene
Definitions, inbox, instance detail, allowed transitions, act/comment endpoints.

### Security zahtevi
Assignment/resource permission na svakoj akciji; immutable decision audit;
attachment policy iz Stage 21.

### UX zahtevi
Prikaz dozvoljenih narednih koraka, deadline/escalation, timeline, optimistic
conflict i accessible action dialog.

### Testovi
Definition validation, transition matrix, concurrent decision, SLA/DST,
permission, audit, notification i E2E.

### Observability
Active/overdue/cycle time/rejected/escalated; bez comment sadržaja u metrics.

### Dokumentacija
Use case, state diagram, definition schema i admin runbook.

### Verovatno pogođeni fajlovi i moduli
Novi `gm/workflow/`, migrations/jobs/events/audit/document/notification,
frontend workflow pages/components.

### Breaking changes
Nema ako je novi use case; migracija postojeće state machine mora biti poseban
eksplicitni plan.

### Migraciona strategija
Pilot definicija feature-flagged; nema retroaktivnih instance-i bez backfill
specifikacije.

### Rizici
Generičnost eksplodira složenost; podržati samo potrebe pilot procesa.

### Acceptance criteria
- Samo dozvoljen actor izvršava samo dozvoljenu tranziciju jednom.
- Concurrent decision ima jedan pobednički ishod i jasan 409.
- Reminder/escalation i DST rokovi su deterministični.
- Ceo tok ima immutable audit/timeline.

### Definition of Done
Opšti DoD; pilot use case radi end-to-end bez TODO engine primitives.

### Procena veličine
XL

### Validacija nakon implementacije
State/property/concurrency/job/security tests, Mermaid transition review,
frontend E2E/a11y i pilot walkthrough.

---

## Phase 8 — PWA i ograničeni offline režim

## Stage 24 — PWA, offline read i bezbedni draftovi

### Status prioriteta
OPCIONO

### Cilj
Aplikacija je installable i jasno radi pri gubitku mreže: cached shell/read-only
podaci i odabrani lokalni draftovi, bez tihih kritičnih mutacija.

### Poslovna vrednost
Bolji rad na nestabilnoj vezi i očuvanje dužeg unosa.

### Tehničko obrazloženje
SPA nema service worker/offline model; auth i konflikt semantika moraju prethoditi.

### Preduslovi
Stage 8–9, 15–17, 20; ADR-22.

### Trenutno stanje
Online-only Vite SPA; access token u memoriji.

### Gap analiza
Nema manifest/SW/cache policy/offline indicator/draft encryption/sync conflicts.

### Obim
Manifest/icons, app-shell caching, explicit stale read cache, offline indicator,
draft za odabrane neosetljive forme, online sync prompt i update UX.

### Van obima
Offline status/order/reservation submit, refresh token u JS storage-u i
background sync osetljivih podataka.

### Backend zadaci
Cache validators/version metadata i conflict-safe draft submit; nema auth
slabljenja.

### Frontend zadaci
Service worker allow-list, cache purge logout/user switch, draft store/version,
online/offline/update UI i recovery.

### Database zadaci
Nisu potrebni osim eventualnog server draft API-ja koji mora biti eksplicitno
odabran u ADR-u.

### API promene
Aditivni ETag/version headers; opcioni draft API.

### Security zahtevi
Ne cache-ovati token/private responses bez kontrole; purge pri logout-u; CSP i
service-worker scope.

### UX zahtevi
Jasan stale/offline indikator, nema lažnog success-a, kontrolisana update
poruka, conflict diff pri sync-u.

### Testovi
Playwright offline/install/update, cache isolation dva korisnika, logout purge,
draft migration/conflict i a11y.

### Observability
Install/update/offline sync failure bez draft sadržaja.

### Dokumentacija
Offline capability matrix, cache/privacy i recovery.

### Verovatno pogođeni fajlovi i moduli
Frontend Vite/PWA config, manifest/icons/SW/draft modules, backend cache/version
headers, CSP deployment config.

### Breaking changes
Nema.

### Migraciona strategija
Service worker versioning i safe cache invalidation; rollout feature flag.

### Rizici
Stale/PII cache na deljenom uređaju; minimalan allow-list i purge testovi.

### Acceptance criteria
- App shell radi offline, a nedostupna operacija je jasno označena.
- Logout/user switch uklanja privatni cache/draft.
- Kritična mutacija nikad ne prikazuje success bez server potvrde.
- SW update ne ostavlja nekompatibilan UI/API cache.

### Definition of Done
Opšti DoD; security cache-isolation testovi prolaze.

### Procena veličine
L

### Validacija nakon implementacije
Lighthouse PWA/a11y, Playwright offline/update/two-user suite, frontend build,
CSP i cache-header pregled.

---

## Phase 9 — Skalabilnost i budući razvoj

## Stage 25 — Feature flags i multi-tenancy readiness

### Status prioriteta
DUGOROČNO

### Cilj
Uvesti typed feature flags i doneti dokazanu odluku o tenant modelu; implementirati
tenant izolaciju samo ako postoji potvrđen multi-organization zahtev.

### Poslovna vrednost
Kontrolisan rollout i mogućnost rasta bez spekulativnog prepisivanja sistema.

### Tehničko obrazloženje
Sistem je single-business; tenant kolona naknadno utiče na svaki query, unique,
audit, job, dokument i cache.

### Preduslovi
Stage 2, 5, 7, 9–14, 20–23; ADR-23/24 i odobren poslovni zahtev.

### Trenutno stanje
Nema flags/tenant koncepta; backend je stateless osim lokalnih fajlova i
in-memory rate limita.

### Gap analiza
Nema tenant context/isolation, tenant-aware unique/policy/audit/test matrice,
object storage namespace-a ni shared rate limit-a.

### Obim
Typed flags sa auditom/rollout pravilima; tenant discovery ADR/prototype; ako je
odobreno, expand/backfill/enforce `tenant_id` kroz sve aggregate-e i infrastrukturu.

### Van obima
Schema-per-tenant bez regulatornog razloga, billing i white-label marketplace.

### Backend zadaci
Flag service, tenant context iz pouzdanog identity izvora, repository guard,
background context propagation i cross-tenant admin zabrana.

### Frontend zadaci
Capability/flag bootstrap, tenant switch samo za eksplicitno ovlašćenog user-a,
cache/query reset po tenant-u.

### Database zadaci
Ako odobreno: tenant tabela, nullable→backfill→not-null tenant FK/compound unique/
indeksi; svaki postojeći red pripada initial tenant-u.

### API promene
Tenant context contract i flags/capabilities aditivno; URL/header izbor ADR.

### Security zahtevi
Cross-tenant isolation test za svaki repository/API/search/export/SSE/document/
job/audit; tenant se ne prihvata nekritički od klijenta.

### UX zahtevi
Jasan aktivni tenant i switch confirmation; feature-disabled ima stabilan
fallback.

### Testovi
Flag matrix, rollout fallback, automated cross-tenant canary, migration/backfill,
cache/event/job isolation i E2E.

### Observability
Tenant ID samo kontrolisan low-cardinality kontekst, ne metric label za veliki
broj tenanta; cross-tenant denial security alert.

### Dokumentacija
ADR, isolation model, onboarding/offboarding, data export/delete i rollout.

### Verovatno pogođeni fajlovi i moduli
Praktično svi backend entiteti/repozitorijumi/servisi i migracije, security/
audit/events/jobs/documents/reports/search, frontend auth/query/routing, deploy.

### Breaking changes
Potencijalno veliki data/API/deployment change; ne izvršavati bez odobrenog ADR-a.

### Migraciona strategija
Expand/migrate/verify/enforce/contract kroz više kompatibilnih deploymenta sa
cross-tenant canary query-jima.

### Rizici
Najveći security rizik roadmap-a je curenje između tenanta; stop-go gate posle
prototype-a.

### Acceptance criteria
- Feature flag ima typed default, owner, expiry i audit.
- Ako tenant nije odobren, stage završava ADR/prototype-om bez lažne produkcione
  implementacije.
- Ako jeste, svaki data path prolazi cross-tenant izolacionu matricu.
- Backfill je idempotentan i bez orphan redova.

### Definition of Done
Opšti DoD; odluka i njen rezultat su eksplicitni, bez polu-tenant sistema.

### Procena veličine
XL

### Validacija nakon implementacije
Kompletan backend/frontend/E2E/security suite, MySQL migration dry-run na kopiji,
cross-tenant automated test i multi-instance smoke.

---

## Phase 10 — Produkciona konsolidacija

## Stage 26 — Produkcioni deployment, backup, hardening i release

### Status prioriteta
OBAVEZNO

### Cilj
Verzionisani immutable image-i se bezbedno deploy-uju u staging/production sa
probes, migracijama, tajnama, backup/restore, smoke i rollback procedurom.

### Poslovna vrednost
Sistem postaje operativno spreman, obnovljiv i kontrolisano izdan.

### Tehničko obrazloženje
Compose sada podiže samo lokalni MySQL; nema application image/deploy/restore.

### Preduslovi
Svi OBAVEZNI stage-ovi 1–16 i relevantni implementirani feature stage-ovi;
Stage 10, 13–14 obavezno.

### Trenutno stanje
Local Compose/MySQL, prod profil i Actuator osnova.

### Gap analiza
Nema Dockerfile-a, non-root runtime-a, TLS/CSP/HSTS, secret managera, staginga,
backup/restore, smoke/rollback/release/changelog/SBOM image scan-a.

### Obim
Multi-stage backend/frontend images, reverse proxy/TLS config, external secrets,
staging pipeline, migration job, probes/graceful shutdown, backup+restore test,
smoke, rollback, release versioning/changelog i final security audit.

### Van obima
Cloud vendor lock-in, multi-region active-active i Kubernetes ako obim ne zahteva.

### Backend zadaci
Non-root/read-only filesystem gde moguće, production config validation, proxy/
forwarded header trust, timeouts/shutdown, actuator network policy.

### Frontend zadaci
Static immutable assets, SPA fallback, runtime API config strategija, CSP bez
unsafe-inline gde moguće, error release metadata.

### Database zadaci
Pre-deploy Flyway validation/migrate sa backup gate-om; automated encrypted
backup, retention i stvarni restore drill.

### API promene
Nema planirano; HTTPS i canonical origin obavezni.

### Security zahtevi
TLS/HSTS/CSP/CORS/secure cookies, secret manager, image/dependency scan, least
privilege DB/runtime, OWASP review i penetration-test findings triage.

### UX zahtevi
Maintenance/degraded/update stanja, cache-safe rollback i smoke kritičnih tokova.

### Testovi
Container structure/security, staging E2E/a11y/load smoke, migration, backup/
restore, rollback, DAST i dependency/image scans.

### Observability
Release marker, deploy/rollback alert, probes/SLO dashboards i on-call runbook.

### Dokumentacija
Deployment, environment matrix, backup/restore, disaster recovery, rollback,
incident response, release/changelog i final production checklist.

### Verovatno pogođeni fajlovi i moduli
Backend/frontend Dockerfile-i (nov), `.dockerignore` (nov), deployment/ops config
(nov), CI workflows, application-prod, reverse proxy config, README/docs.

### Breaking changes
HTTP→HTTPS/canonical host i eventualni runtime config contract; dokumentovati.

### Migraciona strategija
Staging rehearsal, backup, expand-compatible migration, canary/health gate,
smoke; rollback aplikacije samo ako šema ostaje backward-compatible, inače
roll-forward.

### Rizici
Neproveren restore je najveći data rizik; stage nije završen bez stvarnog restore
drill-a.

### Acceptance criteria
- Staging deploy iz immutable artefakta prolazi automatski smoke.
- Production config ne startuje bez svih obaveznih tajni.
- Image radi non-root i nema critical/high neodobren nalaz.
- Backup se vraća u čistu bazu i aplikacija prolazi data smoke.
- Dokumentovan rollback je izveden u staging-u.

### Definition of Done
Opšti DoD; final security audit nema otvoren critical/high nalaz, staging
release/rollback/restore su praktično dokazani.

### Procena veličine
XL

### Validacija nakon implementacije
Kompletan CI; container/image scan i SBOM; staging deploy/E2E/k6 smoke; TLS/CSP/
HSTS test; Flyway validate; backup→clean restore→application smoke; rollback
rehearsal.

---

## Phase 11 — Opcione napredne funkcije

## Stage 27 — AI asistencija i bezbedni plugin extension points

### Status prioriteta
DUGOROČNO

### Cilj
Tek nakon stabilnih permissions/audita/podataka evaluirati jedan merljiv AI use
case i compile-time extension portove bez proizvoljnog runtime koda.

### Poslovna vrednost
Potencijalno ubrzava izveštavanje/pretragu uz kontrolisan rizik i dokaziv ROI.

### Tehničko obrazloženje
AI/plugin pre temelja povećava curenje podataka, netačne odluke i operativni dug.

### Preduslovi
Stage 5, 7, 10–14, 18–22, 26; ADR-25/26 i eksplicitno odobren use case.

### Trenutno stanje
Nema AI ni plugin infrastrukture.

### Gap analiza
Nema provider port-a, consent/redaction/evaluation/audit/cost limits ili stabilnih
extension contracts.

### Obim
Offline evaluation dataset; provider-neutral AI port; jedan read-only use case
(npr. sažetak već dozvoljenog reporta); prompt/output versioning, human review,
audit/cost/rate limit; compile-time report/notification extension port.

### Van obima
Autonomne mutacije, raspoređivanje bez potvrde, treniranje na korisničkim
podacima, runtime upload proizvoljnog plugina.

### Backend zadaci
Permission-scoped retrieval, redaction, timeout/circuit breaker za stvarnog
provider-a, structured output validation i feature flag.

### Frontend zadaci
Jasno označen AI rezultat/izvor/ograničenje, feedback, human confirmation i
non-AI fallback.

### Database zadaci
Minimalni audit/evaluation metadata; ne čuvati prompt/raw osetljive podatke bez
retention/privacy odluke.

### API promene
Eksperimentalni feature-flagged endpoint i stabilni extension port contracts.

### Security zahtevi
No cross-permission retrieval, prompt-injection/data-exfiltration test, secret
isolation, vendor DPA/retention odluka.

### UX zahtevi
AI nikad nije predstavljen kao činjenica bez izvora; korisnik može odbiti/
ispraviti; accessible loading/error/fallback.

### Testovi
Evaluation quality/safety, permission leakage, prompt injection, timeout/circuit
breaker, schema validation, cost cap i E2E fallback.

### Observability
Latency/error/token-cost/acceptance bez raw prompt PII; audit svake upotrebe.

### Dokumentacija
Model/provider card, data flow/threat model, evaluation i plugin contract.

### Verovatno pogođeni fajlovi i moduli
Novi `gm/ai/` i `gm/extension/`, report/search/audit/feature flags, frontend AI
komponente; konfiguracija/dependency samo izabranog provider-a.

### Breaking changes
Nema; eksperimentalni contract nije core API dok ne prođe evaluaciju.

### Migraciona strategija
Offline eval→internal flag→ograničeni pilot→go/no-go; instant kill switch.

### Rizici
Halucinacija, curenje, prompt injection, trošak i vendor lock-in; read-only,
human-in-loop i merljivi stop kriterijumi.

### Acceptance criteria
- Use case ima unapred definisanu kvalitet/bezbednost/ROI metriku i prolazi prag.
- AI ne vidi podatak koji korisnik ne može dobiti regularnim API-jem.
- Timeout/provider failure ima potpun non-AI fallback.
- Nijedna poslovna mutacija se ne izvršava bez eksplicitne validirane akcije.

### Definition of Done
Opšti DoD; ako prag nije dostignut, korektan ishod je dokumentovan no-go i
uklonjen runtime eksperiment, ne polovična funkcija.

### Procena veličine
XL

### Validacija nakon implementacije
Offline evaluation/security corpus, integration timeout/failure tests, cost cap,
permission matrix, frontend E2E/a11y i kill-switch rehearsal.

## Roadmap završna napomena

Attendance, kašnjenje, prekovremeni rad, SMS, push, payment, fiscalization,
delivery, multi-tenancy, AI i runtime plugin nisu postojeći G-Manager domeni.
Ne smeju se predstavljati grafikonima ili implementirati pre eksplicitne
poslovne specifikacije i navedenih preduslova.
