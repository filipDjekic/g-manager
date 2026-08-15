# G-Manager — roadmap za gaming sesije i zaključani PC Client

Status: `PLANNED`  
Datum analize: 2026-08-15  
Izvor istine: trenutno radno stablo, Java/TypeScript kod, Flyway migracije, testovi i deployment artefakti.

Ovaj dokument je autoritativni plan za buduću komandu „Izvrši kompletan Stage N“ u okviru sistema korisničkih naloga, vremenski ograničenih gaming sesija i Windows Gaming PC Client-a. Ne menja postojeći master roadmap; predstavlja zaseban, dependency-ordered product track koji ponovo koristi završene platformске mehanizme.

## 1. Rezultat analize trenutnog sistema

### 1.1 Arhitektura i platforma

- Backend je Java 21 / Spring Boot 4 modularni monolit u `gm/`, organizovan package-by-feature. Transakcije su u servisima, DTO modeli su odvojeni od JPA entiteta, a `BaseEntity` već obezbeđuje UUID, UTC audit vremena i optimistic-lock `version`.
- Frontend je React 19 / TypeScript / Vite SPA u `frontend/g-manager/`, sa centralnim Axios klijentom, React Router rutama, Zustand auth stanjem, TanStack Query mehanizmima i postojećim UI komponentama.
- Baza je MySQL 8.4, schema je pod Flyway kontrolom i Hibernate koristi `ddl-auto=validate`. H2 MySQL mode se koristi za većinu testova, a `MySqlSchemaIT` postoji za stvarni dijalekt.
- Root Compose već sadrži MySQL, backend i frontend. Produkcioni deployment ima odvojene mreže, Docker secrets, read-only kontejnere, health checks, backup/restore i image-based deploy. Windows Client ne pripada Docker okruženju.

### 1.2 Mehanizmi koji se obavezno ponovo koriste

- `RolePermissions`, method security i resource-level policy obrasci za RBAC.
- `AuditWriter` za poslovni audit i `AuthorizationDenialLogger` za odbijene privilegovane radnje.
- Transakcioni outbox za događaje i SSE infrastruktura za brzo osvežavanje zaposlenog web dashboard-a.
- `background_jobs`, lease, retry/backoff, timeout i dead-job infrastruktura za pouzdano isticanje sesija i operativne popravke.
- Principal-scoped `Idempotency-Key` mehanizam za start/extend/terminate komande.
- Pessimistic row locking iz rezervacija/resursa i optimistic version ugovori za konkurentne izmene.
- UTC `Instant` model, uz lokacijsku/business vremensku zonu samo za prikaz i radno vreme.
- Postojeći `Customer`, CRM, pretraga, soft delete, notifikacije, feature flags, metrics i readiness infrastruktura.

### 1.3 Customer nalozi — stvarno stanje i jaz

- Customer trenutno nije poseban entitet: to je postojeći `User` sa rolom `CUSTOMER`. To treba zadržati; CRM ostaje dodatni customer profil.
- Javni `POST /api/v1/auth/register` i frontend `/register` trenutno omogućavaju samostalnu registraciju. To je u direktnom konfliktu sa zahtevom da nalog kreira zaposleni.
- `USER_CREATE` trenutno pripada samo OWNER/ADMIN korisnicima, a `UserAuthorizationPolicy` ne dozvoljava kreiranje role `CUSTOMER`. EMPLOYEE zato trenutno ne može da kreira customer nalog.
- Customer list/detail/CRM već postoje i treba ih proširiti operativnom akcijom „pokreni sesiju“, bez paralelnog Customer sistema.

### 1.4 Oprema i rezervacije — stvarno stanje i jaz

- Radno stablo sadrži `Location`, `Area` i `PhysicalResource`, tipove uključujući `GAMING_PC`, mapu, `active/bookable`, service vezu i pessimistic lock. Flyway V28 povezuje resurs sa rezervacijom i lokacijom.
- Ovo je odgovarajuća osnova za Gaming Station; ne uvodi se zasebna tabela `equipment` sa dupliranim identitetom. Gaming-specifična polja proširuju `physical_resources` ili 1:1 station profile vezan za isti resource ID.
- Trenutni resource model nema operativno stanje `MAINTENANCE/RETIRED`, client enrollment, heartbeat, poslednju potvrđenu enforcement fazu ni aplikacioni profil.
- Rezervacija opisuje budući termin i konflikt intervala. Ona nije aktivna gaming sesija: nema authoritative runtime countdown, extension, client acknowledgment ili završetak. Gaming session mora biti zaseban runtime agregat koji opcionalno referencira rezervaciju.
- V28 je deo trenutnog radnog stabla, ali MySQL runtime potvrda i puni resource testovi moraju biti završeni kao ulazni gate prvog Stage-a.

### 1.5 Security, real-time i operacije

- Browser korisnici koriste access JWT i rotirajuće refresh tokene. Gaming Client ne sme koristiti employee/customer refresh cookie ili employee kredencijale.
- Postojeći SSE je dobar za server → employee browser obaveštenja. Nije dovoljan kao jedini machine protocol jer nema durable command acknowledgment i restart recovery.
- Za Client je najjednostavniji pouzdan model: autentifikovani HTTPS snapshot/long-poll sa monotonim command cursor-om, persistent command tabelom i idempotentnim acknowledgments. WebSocket nije potreban u prvoj verziji. Dashboard dobija promene preko postojećeg outbox → SSE toka, uz query invalidation.
- Postojeći job runner je odgovarajući za expiration i reconciliation; ne uvodi se drugi scheduler framework.

### 1.6 Windows Client odluka

Preporučeni stack je zaseban .NET Windows solution u repozitorijumu:

- .NET LTS Windows Service (`GManager.Agent.Service`) radi pod servisnim identitetom, čuva machine private key u Windows Certificate Store/DPAPI ili TPM-backed provider-u, sinhronizuje stanje, pokreće dozvoljene procese i sprovodi završetak sesije.
- WPF fullscreen shell (`GManager.Agent.Shell`) radi kao ograničeni customer Windows nalog, prikazuje login/locked/session UI i komunicira sa Service-om preko ACL-zaštićenog named pipe-a. Shell ne poseduje machine secret i nije security granica.
- Zajednički protocol/domain projekat i test projekti dele DTO, state reducer i clock/reconnect logiku.
- Windows izolaciju obezbeđuju Assigned Access/restricted account i App Control for Business (WDAC) ili AppLocker prema izdanju OS-a. Client UI, skrivanje taskbara ili procesni blacklist nisu zamena za OS policy.

Tačna .NET LTS verzija zaključava se u Stage-u koji uvodi solution, nakon provere podrške ciljanog Windows izdanja. Ne treba vezati roadmap za preview runtime.

## 2. Ciljni domenski model

### 2.1 Gaming session

Minimalna state machine je:

```text
ACTIVE ── endsAt reached ──> EXPIRED
ACTIVE ── employee action ─> TERMINATED
```

Ne uvode se `CREATED`, `PENDING`, `CANCELLED` ili `COMPLETED` bez realnog pre-start workflow-a. Start je jedna atomska operacija koja kreira `ACTIVE` sesiju. Prirodni završetak je `EXPIRED`; ručni/bezbednosni završetak je `TERMINATED` sa obaveznim razlogom.

`gaming_sessions` najmanje sadrži: `id`, `customer_id`, `resource_id`, `location_id`, nullable `reservation_id`, `started_by`, `started_at`, `ends_at`, nullable `ended_at`, `status`, nullable `termination_reason`, `last_command_sequence`, audit vremena i `version`.

Kritični invarianti:

- najviše jedna `ACTIVE` sesija po resursu;
- najviše jedna `ACTIVE` sesija po customer-u;
- `ends_at > started_at` i pozitivno trajanje unutar konfigurisanog maksimuma;
- samo aktivan customer i `GAMING_PC` koji je active, bookable, nije maintenance i pripada dozvoljenoj lokaciji mogu biti korišćeni;
- start/extend/terminate uvek ponovo proveravaju authorization, station i session stanje unutar iste transakcije;
- `remainingSeconds = max(0, endsAt - serverTime)`; client lokalni sat služi samo za interpolaciju između server sync odgovora.

### 2.2 Station runtime i machine identity

- `gaming_station_profiles`: 1:1 sa `physical_resources`; operational status, assigned application profile, heartbeat/lease politika i client-enabled konfiguracija.
- `station_machine_identities`: javni ključ/certificate thumbprint, key version, status, enrolled/revoked/last-authenticated vremena. Private key nikada nije u bazi.
- `station_enrollment_tokens`: kratkotrajan one-time token, u bazi samo hash, station scope, expiry, consumed metadata i creator audit.
- `station_heartbeats`: trenutni projection ili poslednje stanje; visoko-frekventna istorija ima ograničen retention.
- `station_commands`: monoton `sequence`, tip (`SESSION_STARTED`, `SESSION_EXTENDED`, `SESSION_TERMINATED`, `CONFIG_UPDATED`, `LOCK`), payload version, available/acknowledged vremena i correlation ID.
- `application_definitions`, `application_profiles`, `application_profile_entries` i station-profile assignment modeluju launcher, konkretne igre, pomoćne procese, publisher/path/hash pravila i launch arguments bez dupliranja Windows policy-a.

## 3. API granice

Employee/admin API ostaje pod `/api/v1` i koristi user JWT:

- customer create/search/update/deactivate;
- station overview i maintenance akcije;
- session start, extend, terminate, detail/history;
- enrollment-token create/revoke i application-profile management.

Machine API je odvojen pod `/api/v1/machine`:

- enrollment exchange;
- nonce/challenge authentication i short-lived machine access token;
- station snapshot sa authoritative `serverTime`;
- durable command poll od poslednjeg cursor-a;
- idempotent command acknowledgment;
- heartbeat/status report;
- session-bound customer sign-in bez izdavanja normalnog employee tokena.

Machine token mora sadržati samo machine/station identitet, key version i uzak audience/scope. Enrollment, rotation i revocation moraju ostati auditovani. TLS je obavezan van lokalnog development-a.

## 4. Staged implementation roadmap

## Stage 1 — Zatvaranje foundation gap-ova i ugovora

### Cilj
Zaključati trenutni resource/customer baseline i precizne gaming-session/security ugovore pre novih runtime tabela.

### Šta se menja
Završava se V28/resource vertikala, uklanjaju kontradikcije dokumentacije i uvode ADR-i za session state machine, machine protocol i Windows trust boundary.

### Backend
- Dovršiti module boundaries i testove za trenutni `resource` modul.
- Razdvojiti „web auth session“ događaje od budućih `GAMING_SESSION_*` događaja jasnim imenima.
- Definisati typed `GamingSessionProperties`: min/max/default duration, extension granice, heartbeat interval, offline grace i warning pragove.

### Frontend
- Dovršiti resource route authorization i stabilne loading/error/empty projekcije; bez gaming-session akcija.

### Database
- Potvrditi V28 na praznoj H2 i MySQL šemi; objavljena V28 se nakon primene više ne menja.

### Gaming Client
Nema implementacije. Samo protocol JSON schema/OpenAPI izdvajanje i odluka o solution layout-u.

### Security
- Threat model: ukraden enrollment kod, clone station identity, replay, offline extension, lokalni admin, clock rollback i command duplication.
- Odvojiti browser principal, customer-session principal i machine principal.

### Testovi
Resource authorization/integration/concurrency testovi, H2 migration/context i MySQL Flyway IT.

### Dokumentacija
ADR za agregat, machine authentication, polling/SSE izbor i Windows Service + WPF granicu.

### Dependencies
Trenutno radno stablo sa V28.

### Acceptance criteria
- Current-state dokumenti više ne tvrde da station/resource model ne postoji.
- V28 prolazi na podržanim bazama i schema validate prolazi.
- State machine i machine trust boundary nemaju otvorenu semantičku dvosmislenost.

### Definition of Done
Kod resource baseline-a, migracija, targeted testovi i ADR-i su zeleni; nijedan gaming runtime endpoint još nije izložen.

### Izvršni status (2026-08-15)

`READY_FOR_REVIEW` uz jednu eksternu runtime proveru: resource baseline, H2 V28/context,
authorization/concurrency testovi, typed konfiguracija, frontend route/states i ADR/protocol
ugovori su implementirani i validirani. `MySqlSchemaIT` je usklađen sa V28, ali nije
izvršen jer Docker pokretanje ostaje na korisniku. Nijedan gaming runtime endpoint niti
Windows Client implementacija nije uvedena.

## Stage 2 — Staff-managed customer nalozi

### Cilj
Zaposleni kreira ili nalazi customer-a bez javne registracije i bez administrativnih privilegija.

### Šta se menja
Postojeći `User/CUSTOMER` se proširuje; ne uvodi se paralelni Customer entitet.

### Backend
- Uvesti uske permissions `CUSTOMER_CREATE`, `CUSTOMER_UPDATE_LIMITED`, `CUSTOMER_DEACTIVATE` i dodeliti ih prema matrici.
- Dodati employee-safe customer create/update/deactivate application API sa centralnom policy proverom.
- Zadržati OWNER/ADMIN puni management; EMPLOYEE nikad ne može kreirati ili menjati role zaposlenih.
- Ukloniti/feature-disable javni register endpoint i `AuthService.register` tok.
- Definisati inicijalnu credential proceduru: jednokratna slučajna aktivaciona lozinka/kod sa hashom, expiry-em i obaveznom promenom; nikakva predvidiva lozinka.

### Frontend
- U customer workspace dodati create/find/edit/deactivate tok i jasnu akciju „Pokreni gaming sesiju“ koja je onemogućena dok Stage 3 ne postoji.
- Ukloniti javnu register rutu/link.

### Database
Forward migration za credential activation state/token hash i eventualni `must_change_password`; indeksi po normalizovanom email-u ostaju kanonski.

### Gaming Client
Nema.

### Security
Authorization test za svaku rolu, generičke lookup greške gde enumeration predstavlja rizik, audit bez credential vrednosti.

### Testovi
Employee create/find/limited-update; OWNER/ADMIN prava; CUSTOMER i neautentifikovan pristup odbijeni; public register vraća 404/403 prema zaključanom ugovoru.

### Dokumentacija
Onboarding/activation procedura i RBAC tabela.

### Dependencies
Stage 1.

### Acceptance criteria
- EMPLOYEE može kreirati isključivo CUSTOMER nalog.
- Javni korisnik više ne može sam da se registruje.
- Aktivacioni secret se prikazuje najviše jednom i u bazi postoji samo hash.

### Definition of Done
Backend/frontend customer workflow, migracija, audit i authorization testovi prolaze.

### Izvršni status (2026-08-15)

`IMPLEMENTED`: staff-managed customer create/find/limited-update/deactivate, jednokratna
aktivacija, V29 credential state, zatvorena javna registracija i customer workspace tok su
implementirani. Gaming-session akcija je namerno onemogućena; Stage 3 nije implementiran.

## Stage 3 — Gaming station readiness i aplikacioni profili

### Cilj
Pretvoriti `PhysicalResource(GAMING_PC)` u operativno upravljivu station projekciju pre pokretanja sesija.

### Šta se menja
Dodaju se station profile i održiv allowed-application katalog.

### Backend
- CRUD/policy za `AVAILABLE`, `MAINTENANCE`, `RETIRED`; `IN_SESSION` i `OFFLINE` su izvedena stanja, ne ručno upisani statusi.
- Application profile CRUD sa launcher/game/helper entry-jima, publisher/path/hash metapodacima i versioned konfiguracijom.
- Station overview projection kombinuje resource, operativno stanje, client health i aktivnu sesiju.

### Frontend
OWNER/ADMIN editor station/application profila; EMPLOYEE read-only mapa sa maintenance indikatorom.

### Database
Station profile, application definition/profile/entry/assignment tabele, FK/unique/check/index/version kolone.

### Gaming Client
Nema executable koda; generisani protocol modeli mogu biti pripremljeni.

### Security
Samo OWNER/ADMIN menjaju application policy; EMPLOYEE može promeniti maintenance samo ako eksplicitna permission matrica to dozvoli.

### Testovi
CRUD, invalid state transitions, non-PC resource rejection, RBAC i optimistic-lock konflikti.

### Dokumentacija
Semantika station statusa i application profile modela, uključujući Steam child/helper procese.

### Dependencies
Stage 1.

### Acceptance criteria
- Ne može se bookovati/startovati maintenance ili retired station.
- Allowed apps nisu prost string spisak samo launcher procesa.
- Station overview nema duplirani/stale `IN_SESSION` flag.

### Definition of Done
Station readiness verticala je upotrebljiva bez Client-a i pokrivena testovima.

### Izvršni status (2026-08-15)

`IMPLEMENTED`: V30 station/application schema, station readiness CRUD, izvedeni status
projection port, booking zaštita, RBAC, application policy editor i employee read-only
overview/map indikatori su implementirani. Gaming session, machine API i Client nisu uvedeni.

## Stage 4 — Authoritative gaming-session lifecycle

### Cilj
Implementirati atomski start, extension i manual termination sa backend vremenom kao izvorom istine.

### Šta se menja
Uvodi se novi runtime agregat koji koristi postojeće customer/station identitete, ali ne menja semantiku rezervacije.

### Backend
- Novi `gamingsession` modul sa entitetom, repository lock upitima, transition policy-em, servisom i employee API-em.
- Start zaključava customer i station determinističkim redom, ponovo proverava aktivne sesije/station status/location scope i kreira `ACTIVE` sesiju.
- Extension menja `endsAt` iste sesije; zahteva pozitivno trajanje, version i maksimalni dozvoljeni kraj.
- Termination zahteva razlog, postavlja `endedAt=clock.instant()` i `TERMINATED`.
- Kritične POST komande uključiti u postojeći idempotency filter.
- Auditovati actor, prethodni/novi kraj i razlog; emitovati `GAMING_SESSION_STARTED/EXTENDED/TERMINATED` kroz outbox.

### Frontend
Minimalni employee start dialog iz customer/station prikaza i session detail; kompletan dashboard dolazi u Stage 6.

### Database
`gaming_sessions`, kritični indeksi, FK i check constraints. MySQL zaštita „jedna active“ oslanja se na row locking + transakcioni upit; gde portable constraint nije moguć, concurrency test je obavezan.

### Gaming Client
Nema.

### Security
Nove uske permissions `GAMING_SESSION_START/EXTEND/TERMINATE/READ`; customer nema management akcije.

### Testovi
State machine unit testovi, authorization, validation, idempotency, simultaneous start na istom station-u i isti customer na dve stanice.

### Dokumentacija
Lifecycle tabela, API primeri i audit događaji.

### Dependencies
Stages 2 i 3.

### Acceptance criteria
- Tačno jedan od dva konkurentna starta uspeva.
- Extension ne kreira novu sesiju.
- Preostalo vreme je izvedeno iz `endsAt` i response `serverTime`.

### Definition of Done
Lifecycle API, migracija, testovi i audit/outbox integracija prolaze bez Client-a.

### Izvršni status (2026-08-15)

`IMPLEMENTED`: V31 session schema, autoritativni start/extend/terminate agregat,
determinističko zaključavanje customer/resource redova, location scope, RBAC,
idempotency, audit/outbox, station `IN_SESSION` projekcija i minimalni employee
start/detail UI su implementirani. Automatsko isticanje, command log, SSE session
događaji i Gaming Client ostaju u narednim Stage-ovima.

## Stage 5 — Automatsko isticanje, command log i projekcije

### Cilj
Pouzdano završavati sesije i pripremiti durable server→machine komande.

### Šta se menja
Postojeći jobs/outbox mehanizmi dobijaju session-expiration handler i trajni station command projection.

### Backend
- Job handler bira dospele ACTIVE sesije u batch-u, zaključava ih i idempotentno postavlja `EXPIRED`/`endedAt`.
- Kreirati monotoni station command sequence u istoj transakciji sa session promenom ili preko idempotentnog outbox consumer-a.
- Reconciliation job popravlja retke session/command projection razlike bez produžavanja vremena.
- SSE event za employee dashboard posle start/extend/end/expiry.

### Frontend
Query invalidation na session SSE događaje; još bez pune station table.

### Database
`station_commands`, cursor/ack indeksi, unique station+sequence i retention metadata.

### Gaming Client
Protocol contract test fixture-i, bez OS enforcement-a.

### Security
Command payload ne sadrži credential secret; retention i audit ne loguju customer lozinku/token.

### Testovi
Expiration, duplicate job execution, backend restart/lease recovery, delayed outbox i command ordering.

### Dokumentacija
Sequence/ack semantika, retention i recovery runbook.

### Dependencies
Stage 4 i postojeći jobs/outbox.

### Acceptance criteria
- Dospele sesije završavaju i posle restarta worker-a.
- Duplicate delivery ne menja krajnji rezultat.
- Svaka runtime promena ima durable station command.

### Definition of Done
Jobs/outbox/command integration testovi i metrike prolaze.

## Stage 6 — Employee gaming operations dashboard

### Cilj
Zaposleni sa jedne stranice vidi stanice i upravlja aktivnim sesijama.

### Šta se menja
Postojeći operativni dashboard dobija location-scoped gaming station board i session akcije.

### Backend
Location-scoped station board endpoint vraća projection: station, customer display name, status, `startedAt`, `endsAt`, `serverTime`, version i dozvoljene akcije.

### Frontend
- Responsive station grid: AVAILABLE, ACTIVE + countdown, MAINTENANCE, OFFLINE, EXPIRED/LOCK_PENDING kada je potrebno.
- Akcije +30 min, +60 min, custom extension i manual end koriste postojeći Dialog/Button/error/idempotency obrazac.
- Brza customer pretraga i start tok; konfliktnu verziju rešiti refresh porukom.
- Countdown koristi server offset i periodičnu resync, ne browser vreme kao autoritet.

### Database
Bez nove primarne šeme; eventualni projection indeksi samo dokazani query planom.

### Gaming Client
Nema.

### Security
Location assignment scope se enforce-uje u backend-u; skriveno dugme nije authorization.

### Testovi
Component testovi svih station stanja, countdown/extension, role/location scope i SSE refresh; Playwright employee flow do ACTIVE sesije.

### Dokumentacija
Operativni employee workflow.

### Dependencies
Stages 4–5.

### Acceptance criteria
- Promena je vidljiva bez punog page reload-a.
- Extension odmah ažurira isti countdown.
- EMPLOYEE ne vidi/ne menja lokaciju kojoj nije dodeljen.

### Definition of Done
Dashboard, API, accessibility i relevantni E2E prolaze.

## Stage 7 — Machine enrollment i autentifikovani protocol

### Cilj
Svaka stanica dobija opoziv identitet i zaseban machine API.

### Šta se menja
Uvode se machine principal, enrollment/key lifecycle i durable poll/ack protokol, odvojeni od korisničkog JWT toka.

### Backend
- OWNER/ADMIN kreira kratkotrajan one-time enrollment token za konkretan station.
- Client generiše asymmetric keypair; backend čuva public key i izdaje station identity/key version.
- Challenge/response sprečava replay; uspešna provera izdaje short-lived machine JWT sa uskim audience/scope.
- Rotation/revocation, heartbeat, snapshot, command poll i ack endpointi.
- Machine rate-limit key je station identity, ne IP.

### Frontend
Enrollment/revoke/rotate administracija i station online/last-seen prikaz.

### Database
Enrollment, machine identity, nonce/challenge i heartbeat projection tabele sa expiry/unique/index pravilima.

### Gaming Client
Protocol test harness koji enroll/auth/poll/ack radi bez UI-a; private key storage interfejs sa Windows implementacijom u sledećem Stage-u.

### Security
Private key nije exportovan niti commitovan; token hashovi/nonces imaju TTL; audit bez secret-a; machine endpoint ne prihvata employee JWT kao zamenu.

### Testovi
Enrollment reuse/expiry, signature/replay, revoked key, rotation overlap, wrong-station scope, rate limit i protocol contract testovi.

### Dokumentacija
Enrollment/rotation/revocation runbook i machine OpenAPI.

### Dependencies
Stages 3 i 5.

### Acceptance criteria
- Kopiran enrollment kod se ne može ponovo koristiti.
- Jedna stanica ne može čitati komande druge.
- Opozvan identitet prestaje da dobija tokene.

### Definition of Done
Machine protocol radi kroz test harness, bez employee credentials.

## Stage 8 — Windows Service i fullscreen Shell vertical slice

### Cilj
Napraviti instalabilan Windows Client koji prikazuje locked/active ekran i prati authoritative sesiju.

### Šta se menja
Repository dobija zaseban Windows solution i session-bound customer login ugovor; web SPA se ne pretvara u kiosk agent.

### Backend
Session-bound customer sign-in endpoint: proverava customer credential/access code i aktivnu sesiju baš na autentifikovanoj stanici; vraća samo session-scoped rezultat.

### Frontend
Web frontend dobija download/version/status informaciju za Client paket; nema browser kiosk implementacije.

### Database
Session-login attempt audit i eventualni short-lived access-code hash; bez čuvanja raw credential-a.

### Gaming Client
- Kreirati .NET solution: Service, WPF Shell, Protocol/Domain i test projekti.
- Service koristi Windows Certificate Store/DPAPI/TPM provider, HTTPS machine protocol i ACL named pipe.
- Shell prikazuje locked/login ekran, `Welcome`, countdown, server connectivity i logout.
- Windows restart oporavlja enrolled identity i poslednji bezbedan snapshot.
- Signed installer/MSIX strategija i Windows Service recovery options.

### Security
Shell nema machine private key ni privilege; Service validira svaki local request; customer credential se ne piše na disk/log.

### Testovi
.NET unit/contract testovi za auth, countdown offset, IPC ACL adapter, restart recovery i backend unavailable.

### Dokumentacija
Build/install/uninstall, log locations, service recovery i development certificate uputstvo.

### Dependencies
Stage 7.

### Acceptance criteria
- Enrolled station posle restarta prikazuje tačan backend snapshot.
- Customer se može prijaviti samo na svoju aktivnu station sesiju.
- Shell ne poseduje machine secret.

### Definition of Done
Instalabilan development build i testirana end-to-end komunikacija bez OS lockdown politike.

## Stage 9 — Allowed applications i OS policy integracija

### Cilj
Pokretati samo konfigurisan launcher/game/helper skup, uz OS application control kao stvarnu granicu.

### Šta se menja
Application profile postaje izvršiva, versioned konfiguracija koju Windows Service primenjuje zajedno sa OS allowlist politikom.

### Backend
Versioned, potpisiv station configuration snapshot; validacija executable path/publisher/hash/arguments i audit promena profila.

### Frontend
Editor jasno razlikuje launcher, game i helper procese; preview efektivne station politike.

### Database
Po potrebi dopuna application profile modela za publisher certificate, file hash/version i dependency grupu.

### Gaming Client
- Shell prikazuje dugmad samo iz aktivnog profila.
- Service pokreće samo backend-konfigurisane entry-je i prati proces tree; UI allowlist nije jedini enforcement.
- Steam model uključuje konkretne igre i potrebne helper procese.
- Chrome se startuje sa enterprise policies; download/execute rizik se rešava WDAC/AppLocker, filesystem ACL-om, restricted account-om i bez local admin prava.

### Security
Generisati/validirati App Control/AppLocker policy artefakte; policy update je signed/versioned i ima rollback proceduru.

### Testovi
Dozvoljen app/game/helper, zabranjen executable, tampered config, policy rollback i Chrome download scenario na Windows test mašini.

### Dokumentacija
Supported Windows edition matrica i policy authoring/deployment procedura.

### Dependencies
Stages 3 i 8.

### Acceptance criteria
- Dozvoljavanje `steam.exe` samo po sebi nije dovoljno za pokretanje proizvoljne igre.
- Preuzeti `.exe/.bat/.cmd/.ps1` ne može da se izvrši pod customer nalogom.
- Client se ne predstavlja kao jedina security granica.

### Definition of Done
Repo artefakti i Windows test dokazi potvrđuju allowlist defense-in-depth.

## Stage 10 — Offline lease, reconnect i pouzdan završetak

### Cilj
Definisano i bezbedno ponašanje pri LAN/backend/client/Windows kvarovima.

### Šta se menja
Session snapshot postaje vremenski ograničen signed lease, a station availability zavisi od potvrđenog lokalnog zaključavanja.

### Backend
- Izdaje kratkotrajan signed session lease/snapshot sa `sessionId`, station, customer, `endsAt`, config version, issued/expiry i command cursor vrednostima.
- Reconciliation status razlikuje backend session end od client `LOCK_ACK`; station nije AVAILABLE dok bezbedan ack ili operator recovery ne potvrdi zaključavanje.
- Operativni endpoint za force-lock/reconcile uz audit.

### Frontend
Dashboard prikazuje `OFFLINE`, `LOCK_PENDING`, stale heartbeat i recovery akcije, bez lažnog AVAILABLE statusa.

### Database
Client enforcement/ack projection, last lease/config version i reconciliation audit.

### Gaming Client
- Cached lease je potpisan i nema mogućnost lokalne extension izmene.
- Kratak grace period služi samo za prolazne prekide; nikad ne daje beskonačno vreme.
- Countdown se nastavlja iz poslednjeg server offset-a, obrađuje clock drift/rollback i po isteku lokalno zaključava.
- Reconnect primenjuje najnoviji sequence, ignoriše duplicate i ack-uje izvršeno stanje.
- Backend/client/Windows restart scenariji imaju deterministic recovery reducer.

### Security
Fail-closed posle lease+grace; offline extension nije dozvoljen; signing key je spoljašnji production secret, client ima samo verification public key.

### Testovi
Network loss, delayed/duplicate/out-of-order commands, clock drift, backend restart, service restart, Windows restart i station offline pri expiry-u.

### Dokumentacija
Failure matrix i operator recovery runbook.

### Dependencies
Stages 5, 7–9.

### Acceptance criteria
- Gubitak mreže ne produžava sesiju beskonačno.
- Istek se lokalno enforce-uje i naknadno idempotentno usklađuje.
- Station postaje AVAILABLE tek nakon bezbednog lock acknowledgement-a.

### Definition of Done
Automatizovani failure testovi i ručni Windows restart drill prolaze.

## Stage 11 — Produkcioni hardening, E2E i rollout

### Cilj
Završiti observability, distribuciju, operativne procedure i pun business E2E.

### Šta se menja
Sve prethodne vertikale povezuju se u pilot-ready release sa signing, monitoring, recovery i rollout kontrolama.

### Backend
Session/station/client metrics, readiness health, command lag, expired-but-unacked alarm, enrollment/auth failure alarm i retention jobs.

### Frontend
Operativni attention widgeti, dostupna station istorija i jasni support correlation ID-jevi.

### Database
MySQL migration-from-previous test, backup/restore obuhvat novih tabela, retention za heartbeat/commands/nonces.

### Gaming Client
Code-signed release, auto-update strategija sa rollback-om, least-privilege service ACL, sanitized structured logs i support bundle bez secrets/PII.

### Security
Threat-model review, dependency/SBOM scan, key/certificate rotation drill, penetration test machine API-ja i Windows policy review.

### Testovi
Pun E2E: employee create/find customer → bira station → start → client login/snapshot → countdown → extension → client update → expiry → lock ack → AVAILABLE. Dodati concurrency, soak, offline i upgrade/rollback scenarije.

### Dokumentacija
Production deployment, certificates/DNS/firewall, provisioning, incident response, backup/restore i release checklist.

### Dependencies
Stages 1–10.

### Acceptance criteria
- Kritični E2E prolazi na podržanom Windows izdanju i MySQL-u.
- Alarm detektuje command lag/offline station/lock pending.
- Key rotation i client rollback su praktično provereni.

### Definition of Done
Svi stage acceptance kriterijumi su zatvoreni, spoljne obaveze dokumentovane i release je odobren za kontrolisani pilot.

## 5. Globalna pravila implementacije

- Stage ne sme unapred implementirati sledeći Stage osim najmanjeg compile-time ugovora eksplicitno navedenog u dependency-ju.
- Postojeće `User(CUSTOMER)`, `PhysicalResource(GAMING_PC)`, audit, outbox, jobs, idempotency, SSE, Clock i permission obrasce treba proširiti, ne duplirati.
- Nijedna kritična odluka ne zavisi od frontend/client prikaza; backend i OS policy su autoriteti.
- Sve vreme u bazi/API-ju je UTC `Instant`; response koji hrani countdown sadrži `serverTime`.
- Svaka machine komanda je durable, monotona, idempotentna i potvrdiva.
- Sve Flyway promene su forward-only; već primenjena migracija se ne prepravlja.
- Production secret/key/certificate se ne commit-uje. Primeri sadrže samo nazive i format.
- Docker se ne koristi za Windows-specific Client ili lockdown.
- Posle svakog Stage-a pokreću se samo relevantni targeted testovi i jedan završni validation pass propisan njegovim DoD-om.

## 6. Stvari koje vlasnik sistema mora uraditi van source code-a

Sledeće se ne mogu pouzdano zaključiti ili izvršiti samo iz repozitorijuma:

1. Izabrati i dokumentovati tačno podržano Windows izdanje/build. Razumna početna pretpostavka je upravljani Windows Enterprise/Education uređaj; Windows Home nije prihvatljiv production target za zahtevani lockdown.
2. Obezbediti lokalni standard customer nalog bez local administrator privilegija i odvojeni servisni identitet.
3. Konfigurisati Assigned Access/restricted user experience i App Control for Business (WDAC) ili AppLocker u audit modu, zatim enforced modu posle validacije aplikacija/driver-a.
4. Obezbediti code-signing certificate i bezbedan CI signing proces za Service/Shell/installer; private key ne ide u Git.
5. Provisionovati TLS DNS/certificate, firewall pravila i pouzdanu LAN rutu do backend-a.
6. Provisionovati production machine/session signing keys i definisati rotation/revocation odgovornost.
7. Inventarisati stvarne Steam igre, launchere, anti-cheat i helper executable/publisher zahteve po station grupi.
8. Odlučiti poslovne vrednosti: maksimalna sesija/extension, ko sme da produži/prekine, jedan customer na jednoj stanici, offline grace i warning pragovi. Predloženi default-i za početak su 8 h maksimum, EMPLOYEE/ADMIN/OWNER operacije, jedna aktivna sesija po customer-u, 60 s offline grace i upozorenja 15/5/1 min.
9. Obezbediti reprezentativnu Windows test mašinu za policy, restart, update/rollback i E2E validaciju.

## 7. Završna dependency mapa

```text
Stage 1 ─┬─> Stage 2 ───────┐
         └─> Stage 3 ──┐    ├─> Stage 4 ─> Stage 5 ─> Stage 6
                       └────┘             │
Stage 3 ──────────────────────────> Stage 7 ─> Stage 8 ─> Stage 9
                                             └───────────> Stage 10
Stage 5 ─────────────────────────────────────────────────> Stage 10
Stages 1–10 ─────────────────────────────────────────────> Stage 11
```

Stage 2 i Stage 3 mogu se izvršavati nezavisno nakon Stage 1. Stage 6 je web-operativni rezultat bez Windows Client-a; Stage 7–10 grade machine vertikalu. Stage 11 je jedini production-release gate.
