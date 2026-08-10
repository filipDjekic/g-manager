# G-Manager

G-Manager je Spring Boot + React aplikacija za upravljanje lokalnim biznisom.

## Lokalno pokretanje

Preduslovi:

- Java 21;
- Node.js 22 i npm;
- Docker sa Compose podrškom za lokalni MySQL 8.4.

Od čistog checkout-a:

1. U korenu repozitorijuma napraviti lokalni `.env`. Root `.env.example` se
   namerno ne održava: lokalni `.env` je već standard projekta i ignorisan je
   kroz `.gitignore`. Minimalni sadržaj je:

   ```dotenv
   JWT_SECRET=<nasumična-development-vrednost-od-najmanje-32-UTF-8-bajta>
   ```

   Ostale podržane promenljive i njihove local podrazumevane vrednosti navedene
   su u tabeli ispod. Ne koristiti development vrednosti u produkciji.

2. U korenu repozitorijuma pokrenuti MySQL:

   ```bash
   docker compose up -d mysql
   ```

   Compose kreira bazu `gmanager` i lokalnog korisnika iz
   `docker-compose.yml`. Nije potrebno ručno kreirati tabele.

3. Pokrenuti backend. Kada profil nije eksplicitno naveden, `local` je
   podrazumevani profil:

   PowerShell:

   ```powershell
   cd gm
   .\mvnw.cmd spring-boot:run
   ```

   Bash:

   ```bash
   cd gm
   ./mvnw spring-boot:run
   ```

4. U drugom terminalu instalirati frontend isključivo iz lock fajla i
   pokrenuti Vite:

   ```bash
   cd frontend/g-manager
   npm ci
   npm run dev
   ```

Backend je dostupan na `http://localhost:8080`, health provera na
`http://localhost:8080/actuator/health`, a frontend na
`http://localhost:5173`. Vite u development režimu prosleđuje `/api` i
`/media` zahteve backendu.

Backend koristi Flyway migracije i validira šemu pri startu. Podrazumevane lokalne
vrednosti odgovaraju `docker-compose.yml`; za druga okruženja koristiti promenljive
iz lokalnog `.env` fajla. Poslovna vremenska zona je eksplicitno
`Europe/Belgrade`, dok se
timestamp vrednosti čuvaju i obrađuju u UTC.

Profil `local` preko Spring Config Data automatski učitava `.env` iz korena
repozitorijuma kada se backend pokreće iz `gm` direktorijuma. Podržano je i
pokretanje iz korena repozitorijuma. `.env` mora sadržati plain-text
`JWT_SECRET` od najmanje 32 nasumična UTF-8 bajta. Nije potrebna Dotenv
biblioteka niti ručno kopiranje vrednosti u IntelliJ run konfiguraciju.

Ista vrednost se po potrebi može proslediti direktno kroz environment procesa:

PowerShell:

```powershell
$env:JWT_SECRET="<bezbedna-development-vrednost-od-najmanje-32-bajta>"
cd gm
.\mvnw.cmd spring-boot:run
```

Bash:

```bash
export JWT_SECRET="<bezbedna-development-vrednost-od-najmanje-32-bajta>"
cd gm
./mvnw spring-boot:run
```

`.env` je ignorisan kroz `.gitignore` i nije deo aplikacionog artefakta.
Automatski import postoji samo u `application-local.yml`. Test profil koristi
sopstvenu izolovanu konfiguraciju, dok `prod` profil ne učitava `.env` i
zahteva environment promenljive procesa ili deployment platforme.

Frontend promenljive se čitaju iz `frontend/g-manager/.env`. Primer je u
`frontend/g-manager/.env.example`. Podrazumevani `VITE_API_URL=/api/v1`
koristi Vite proxy. Za odvojeno hostovan production frontend postaviti pun
URL, na primer `https://api.example.com/api/v1`, i isti origin dodati u
backend `CORS_ALLOWED_ORIGINS`.

Produkcija se pokreće sa profilom `prod` i obaveznim spoljašnjim
`JWT_SECRET`; aplikacija namerno neće podići context ako promenljiva nedostaje,
prazna je ili je kraća od 32 UTF-8 bajta. Za prvi OWNER nalog opciono se
postavljaju `INITIAL_OWNER_EMAIL`, `INITIAL_OWNER_PASSWORD` i
`INITIAL_OWNER_NAME`. Provisioning je idempotentan i ne menja postojeći nalog.

Lokalni HTTP razvoj koristi `COOKIE_SECURE=false`. U HTTPS okruženjima ova vrednost
mora biti `true`, što je i podrazumevana backend vrednost.

## Environment ugovor

| Promenljiva | Local podrazumevano | Production |
|---|---|---|
| `JWT_SECRET` | Obavezna u `.env`, najmanje 32 UTF-8 bajta | Obavezna spoljna tajna |
| `DB_URL` | `jdbc:mysql://localhost:3306/gmanager?...` | Obavezna deployment vrednost |
| `DB_USERNAME` | `gmanager` | Obavezna deployment vrednost |
| `DB_PASSWORD` | `gmanager` | Obavezna deployment tajna |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Eksplicitna HTTPS allow-lista |
| `COOKIE_SECURE` | `false` kroz local profil | Mora biti `true` |
| `BUSINESS_TIME_ZONE` | `Europe/Belgrade` | Eksplicitno po deploymentu |
| `UPLOAD_ROOT` | `data/uploads` | Trajan, backupovan storage path |
| `CANCELLATION_CUTOFF_MINUTES` | `60` | Opciono poslovno podešavanje |
| `INITIAL_OWNER_EMAIL` | Prazno, provisioning isključen | Samo za kontrolisan bootstrap |
| `INITIAL_OWNER_PASSWORD` | Prazno, provisioning isključen | Obavezna tajna kada se bootstrap koristi |
| `INITIAL_OWNER_NAME` | `Initial Owner` | Opciono |

Spring `local` profil automatski učitava root `.env`; `test` profil koristi
izolovane H2 i JWT vrednosti; `prod` profil ne uvozi `.env`. IntelliJ ne zahteva
dodatnu environment konfiguraciju kada je working directory koren
repozitorijuma ili `gm/`.

Sve `app.*` vrednosti se vezuju kroz validirani typed configuration contract.
Aplikacija namerno prekida startup sa binding/validation greškom kada je
poslovna zona, CORS lista, storage, idempotency, reservation, JWT ili inicijalni
OWNER bootstrap neispravno podešen.

## Auth API

- `POST /api/v1/auth/register` — kreira isključivo CUSTOMER nalog, vraća `201`.
- `POST /api/v1/auth/login` — vraća access token i korisnika; postavlja refresh cookie.
- `POST /api/v1/auth/refresh` — rotira refresh token i vraća novu access sesiju.
- `POST /api/v1/auth/logout` — opoziva refresh token i briše cookie, vraća `204`.

Access token traje 15 minuta i čuva se samo u memoriji frontenda. Refresh token
traje 14 dana, dostavlja se kao `HttpOnly`, `SameSite=Strict` cookie, a baza čuva
samo njegov SHA-256 hash. Ponovna upotreba već rotiranog tokena opoziva aktivne
refresh sesije korisnika.

## Provere

- Sve backend i frontend provere iz korena:
  - Windows/PowerShell: `.\scripts\verify.cmd`
  - Bash: `./scripts/verify.sh`
- Backend clean test/build: `cd gm && ./mvnw clean verify`
- MySQL 8.4 migration/repository/concurrency suite (zahteva pokrenut Docker):
  `cd gm && ./mvnw clean verify -Pmysql-it`
- Frontend instalacija: `cd frontend/g-manager && npm ci`
- Frontend typecheck: `npm run typecheck`
- Frontend lint: `npm run lint`
- Frontend testovi: `npm test`
- Frontend production build: `npm run build`

Flyway migracije se automatski izvršavaju pri backend startup-u i tokom
integration testova. Produkcija se pokreće sa `SPRING_PROFILES_ACTIVE=prod`
i spoljašnjim `JWT_SECRET`; lokalni profil se može aktivirati i promenljivom
`SPRING_PROFILES_ACTIVE=local`.

Brzi integration testovi koriste H2 i nisu dokaz kompatibilnosti migracija sa
produkcijskom bazom. Profil `mysql-it` pokreće efemerni MySQL 8.4 kroz
Testcontainers i proverava praznu šemu, V(n-1)→latest upgrade, Hibernate
validaciju, kritične constraints/indekse, vremensku preciznost i optimistic
locking. Kredencijali postoje samo tokom testa i ne upisuju se u log.

Primenjene Flyway migracije se nikada ne menjaju. Korekcije su nove,
expand-only `V<n>__opis.sql` migracije; rollback se radi narednom roll-forward
migracijom. Svaka promena šeme mora proći i `clean verify` i `clean verify
-Pmysql-it`.

## Bezbednosna osnova

Javni su health, registracija/login/refresh/logout i čitanje avatar resursa.
Sve ostale backend rute su zatvorene po default-u.

## Upravljanje identitetima (Stage 3)

Svaki autentifikovani korisnik ima `GET/PATCH /api/v1/users/me`,
`PATCH /api/v1/users/me/password` i multipart
`POST /api/v1/users/me/avatar`. Profil dozvoljava izmenu samo imena, promena
lozinke zahteva trenutnu lozinku i opoziva refresh sesije, a avatar prihvata
samo PNG/JPEG sa odgovarajućim potpisom do 5 MB.

`OWNER` i `ADMIN` koriste paginirani `GET /api/v1/users`, `POST /api/v1/users`
i `PATCH /api/v1/users/{id}/deactivate`. `OWNER` upravlja administratorima i
zaposlenima, dok `ADMIN` vidi i menja isključivo zaposlene. Samodeaktivacija
nije dozvoljena, a API odgovori ne sadrže hash lozinke.

Avatar skladište je izolovano iza `FileStorageService`; lokalni root podešava
`UPLOAD_ROOT` (podrazumevano `data/uploads`).

## Katalog (Stage 4)

Svi autentifikovani korisnici mogu da čitaju paginirani katalog preko
`GET /api/v1/catalog`. Podržani su filteri `type`, `active`, `search`,
`minPrice` i `maxPrice`, uz sortiranje po `name`, `price`, `type` ili
`createdAt`. CUSTOMER i EMPLOYEE uvek dobijaju samo aktivne stavke.

`OWNER` i `ADMIN` koriste:

- `POST /api/v1/catalog`
- `PATCH /api/v1/catalog/{id}`
- `PATCH /api/v1/catalog/{id}/deactivate?version={version}`
- `PATCH /api/v1/catalog/{id}/activate?version={version}`
- `POST /api/v1/catalog/{id}/image?version={version}`

Usluga mora imati pozitivno trajanje, a proizvod ne sme imati trajanje.
Izmena, deaktivacija i upload slike koriste očekivanu `version`; zastareo
zahtev vraća `409 Conflict`. Slike koriste istu validaciju i storage
apstrakciju kao avatari.

## Radno vreme (Stage 5)

`GET /api/v1/working-hours` vraća svih sedam dana svakom autentifikovanom
korisniku. `OWNER` i `ADMIN` podešavaju dan preko
`PUT /api/v1/working-hours/{dayOfWeek}`. Interval čiji je kraj pre početka
predstavlja legitimnu smenu preko ponoći; jednaki početak i kraj nisu
dozvoljeni.

Kalendarski izuzeci koriste:

- `GET/POST /api/v1/working-hours/exceptions`
- `PUT/DELETE /api/v1/working-hours/exceptions/{id}`

Izuzetak može zatvoriti ceo budući dan ili definisati oba kraja skraćenog
radnog vremena. Jedan datum može imati samo jedan izuzetak. Izmene i brisanje
su zaštićeni poljem `version`.

Backend računa konkretne poluotvorene UTC intervale `[open, close)` iz
lokalnog datuma i zone `app.business-zone` (`Europe/Belgrade`). Validator
proverava današnju i prelivenu jučerašnju smenu, ceo interval usluge,
kalendarske izuzetke i DST promene bez korišćenja fiksnog UTC offseta.

## Rezervacije (Stage 6)

CUSTOMER kreira rezervaciju preko `POST /api/v1/reservations`. Zahtev mora
imati jedinstven `Idempotency-Key`; ponavljanje istog zahteva vraća sačuvan
odgovor, dok ponovna upotreba ključa sa drugim telom vraća `409 Conflict`.
Aktivne usluge se mogu rezervisati samo kod aktivnog EMPLOYEE korisnika, u
budućem terminu koji u celosti pripada radnom vremenu i ne preklapa se sa
drugom aktivnom rezervacijom zaposlenog.

API rute su:

- `GET /api/v1/reservations/me` — CUSTOMER vidi samo svoje rezervacije.
- `GET /api/v1/reservations` — EMPLOYEE vidi samo svoje termine, a
  OWNER/ADMIN sve termine; podržani su status, zaposleni i datumski filteri.
- `PATCH /api/v1/reservations/{id}/status` — menja status uz obaveznu
  optimističku `version`.
- `GET /api/v1/users/employees` — lista aktivnih zaposlenih za izbor termina.

Stanja prate tok `PENDING -> CONFIRMED -> COMPLETED`, uz `REJECTED` za zahtev
na čekanju i `CANCELLED` iz dozvoljenih aktivnih stanja. Zaposleni potvrđuje,
odbija i završava svoje termine. CUSTOMER otkazuje sopstveni termin najmanje
`RESERVATION_CANCELLATION_CUTOFF_MINUTES` minuta pre početka (podrazumevano
60), dok OWNER/ADMIN mogu administrativno da otkažu bez tog ograničenja.
Terminalna stanja se više ne menjaju.

Vremena se u API-ju i bazi prenose kao UTC timestamp vrednosti, dok frontend
unos i prikaz konvertuje kroz poslovnu zonu `Europe/Belgrade`. Idempotency
zapisi imaju podesiv TTL i periodično se uklanjaju.

## Narudžbine (Stage 7)

CUSTOMER pravi pickup narudžbinu preko `POST /api/v1/orders`, uz obavezan
`Idempotency-Key`. Request sadrži samo `productId` i pozitivnu `quantity`;
server prihvata isključivo aktivne `PRODUCT` stavke, uzima aktuelnu cenu iz
kataloga, čuva je kao snapshot `unitPrice` i računa `lineTotal` i
`totalPrice`. Cela korpa se upisuje atomarno ili se u potpunosti odbija.

Rute modula su:

- `GET /api/v1/orders/me` — CUSTOMER vidi samo sopstvene narudžbine.
- `GET /api/v1/orders` — EMPLOYEE, ADMIN i OWNER vide operativnu listu sa
  filterima `status`, `handledBy`, `from` i `to`, uz paginaciju i sortiranje.
- `PATCH /api/v1/orders/{id}/status` — menja status uz očekivanu `version`.

Statusni tok je `CREATED -> IN_PROGRESS -> READY -> COMPLETED`. Preuzimanje u
obradu atomarno postavlja `handledBy` na trenutnog zaposlenog. CUSTOMER može
otkazati samo sopstvenu `CREATED` narudžbinu; handler može otkazati
`IN_PROGRESS`, dok `READY` može otkazati samo ADMIN/OWNER. `COMPLETED` i
`CANCELLED` su terminalna stanja. Optimistic locking vraća `409 Conflict` za
zastarelu ili konkurentnu promenu.

## Dashboard (Stage 8)

`OWNER` i `ADMIN` koriste
`GET /api/v1/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`. Endpoint vraća
ukupan prihod i broj samo `COMPLETED` narudžbina, kao i broj rezervacija po
svakom statusu. Prazni statusi i prazan opseg vraćaju nule. Datumi su
inkluzivni lokalni datumi u poslovnoj zoni, a backend ih pretvara u
poluotvoreni UTC interval `[from, to + 1 dan)`.

`EMPLOYEE`, `ADMIN` i `OWNER` mogu koristiti
`GET /api/v1/dashboard/today`. Operativni odgovor sadrži broj `PENDING` i
`CONFIRMED` rezervacija trenutnog korisnika za današnji poslovni dan, broj
svih današnjih nepreuzetih `CREATED` narudžbina i broj njegovih
`IN_PROGRESS` narudžbina.

Sve metrike računaju se direktno u bazi preko `COUNT`, `SUM` i `GROUP BY`
upita; dashboard ne učitava domenske entitete radi agregacije. Frontend
prikazuje operativne kartice zaposlenom, a managementu filter datuma,
finansijske kartice i Recharts grafikone.

## Cross-cutting hardening (Stage 9)

Sve API greške koriste jedinstveni format
`timestamp/status/error/message/path/requestId`. Ulazni `X-Request-Id` se
prihvata samo kada je bezbednog formata; u suprotnom se generiše UUID.
Neočekivane greške vraćaju generičku poruku bez stack trace-a ili internih
detalja, dok log sadrži samo request ID i tip izuzetka. Konflikti baze i
optimistic locking vraćaju `409`, a prekoračenje upload limita `413`.

Kolekcije podrazumevano koriste `page=0&size=20`. Negativna stranica i
nepozitivna veličina se odbijaju, dok se `size` veći od 100 bezbedno
ograničava na 100. Login je ograničen na 5 pokušaja u 10 minuta po
IP/e-mail paru, registracija na 10 zahteva na sat po IP adresi, a kreiranje
narudžbina i rezervacija na 30 zahteva u minutu po korisniku i endpointu.
Odgovor `429` uključuje `Retry-After`.

Spring Actuator izlaže `health`, `info` i `metrics`. Health je javan, dok su
metrike dostupne samo OWNER/ADMIN rolama; HTTP latency/status, repository,
JDBC i connection-pool metrike pokrivaju response time, error rate i stanje
baze. Odgovori imaju `nosniff`, `DENY` frame policy, `no-referrer` i
isključene camera/microphone/geolocation dozvole.

Frontend centralno obrađuje `409`, `413`, `429` i `5xx`, prikazuje request ID
za podršku, ne radi tihi retry konflikta i koristi globalni error boundary za
neočekivane render greške.
