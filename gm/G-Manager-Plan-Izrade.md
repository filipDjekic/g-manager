# G-Manager — Inženjerski Plan Izrade

**Stack:** Spring Boot 3.x (Java 21) + React (TypeScript) + PostgreSQL
**Metodologija:** Backend First — API se smatra "gotovim" tek kada je 100% pokriven Postman/Newman kolekcijom i kada su svi edge-case-ovi (409, 403, 401, validacije) verifikovani ručno, pre nego što se piše ijedan red frontend koda.

---

## 1. KORAK-PO-KORAK PLAN I REDOSLED IZRADE

### FAZA 0 — Bootstrap & Infrastruktura
**Preduslov:** ništa (starting point)
**Šta se pravi:**
- Maven multi-nema potrebe za multi-modulom — jedan Spring Boot projekat, "package-by-feature" unutar `com.gmanager`.
- `docker-compose.yml` sa PostgreSQL servisom (lokalni dev).
- Bazna konfiguracija: `application.yml` (profili: `local`, `dev`, `prod`), `.env` šablon sa promenljivama iz sekcije 21 (DB_URL, DB_USERNAME, DB_PASSWORD, JWT_SECRET, CORS_ALLOWED_ORIGINS).
- Flyway/Liquibase setup (preporuka: **Flyway**) — `V1__init.sql` prazna baza spremna za migracije.
- Globalni `common` paket: `BaseEntity` (id, createdAt, updatedAt, @Version), `GlobalExceptionHandler` skelet, `ApiError` DTO (tačno po sekciji 8).
- CI korak (opciono): GitHub Actions — `mvn clean verify` na push.

**Izlaz faze:** Projekat se pokreće, konektuje na bazu, `/actuator/health` vraća 200.

---

### FAZA 1 — Security & Auth Modul (temelj svega)
**Preduslov:** Faza 0 završena.
**Šta se pravi:**
- `security` paket: `JwtService` (generisanje/parsiranje tokena), `JwtAuthenticationFilter`, `SecurityConfig` (Spring Security 6, `SecurityFilterChain`).
- `auth` modul: `AuthController` (`/api/v1/auth/login`, `/register`), `AuthService`, DTO-ovi (`LoginRequest`, `RegisterRequest`, `AuthResponse`).
- **Kritično pravilo (sekcija 20):** JWT nosi samo `userId` (subject). Rola i `active` status se **uvek** čitaju iz baze u `JwtAuthenticationFilter` — token se ne veruje za autorizaciju, samo za identitet.
- `@PreAuthorize` konvencija po rolama (OWNER, ADMIN, EMPLOYEE, CUSTOMER) definisana kao enum + custom `SecurityExpressionHandler` ili metodski `@PreAuthorize("hasRole('ADMIN')")`.
- Rate limiting na `/login` i `/register` (Bucket4j ili interceptor) — 5/10min i 10/sat (sekcija 24).
- Password hashing: `BCryptPasswordEncoder`.

**Testiranje:** Postman kolekcija — login uspešan/neuspešan, expired token, invalid role claim, rate-limit trigger (429/403).

**Izlaz faze:** Kompletan auth flow rade end-to-end, JWT filter štiti sve buduće endpointe.

---

### FAZA 2 — User Modul
**Preduslov:** Faza 1 (Auth) završena.
**Šta se pravi:**
- CRUD za `User` entitet, ali sa strogim pravilima rola:
  - OWNER upravlja ADMIN + EMPLOYEE.
  - ADMIN upravlja samo EMPLOYEE (ne sme dirati OWNER ni druge ADMIN-e — validacija u `UserService`, ne u kontroleru).
  - CUSTOMER vidi/edituje samo svoj profil (`/api/v1/users/me`).
- Soft delete (sekcija 25: `active = false`, nikad fizičko brisanje).
- DTO-ovi: `UserResponse` (bez `passwordHash`!), `CreateUserRequest`, `UpdateUserRequest`.

**Testiranje:** Postman — matrica dozvola (OWNER→ADMIN OK, ADMIN→OWNER 403, EMPLOYEE→bilo šta upravljačko 403).

**Izlaz faze:** Kompletno upravljanje korisnicima i rolama, spremno za sledeće module koji zavise od `userId`.

---

### FAZA 3 — Catalog Modul
**Preduslov:** Faza 2 (potreban je `active` user check i role za ADMIN pristup).
**Šta se pravi:**
- `CatalogItem` CRUD.
- Validacija na nivou servisa: `type == SERVICE` → `durationMinutes` obavezan; `type == PRODUCT` → `durationMinutes` mora biti `null`.
- `inactive` item se ne može dodati ni u Order ni u Reservation (provera u Order/Reservation servisima kasnije, ali flag se definiše ovde).
- EMPLOYEE ima read-only pristup (`@PreAuthorize` samo na GET).

**Testiranje:** Postman — kreiranje SERVICE bez duration (400), kreiranje PRODUCT sa duration (400), deaktivacija itema.

**Izlaz faze:** Katalog spreman kao referentni izvor za Order i Reservation module.

---

### FAZA 4 — Reservation Modul (kompleksan modul)
**Preduslov:** Faza 3 (Catalog) i Faza 2 (User/Employee).
**Šta se pravi:**
- `Reservation` CRUD sa statusnom mašinom (PENDING → CONFIRMED/REJECTED, CONFIRMED → COMPLETED/CANCELLED).
- **Poslovna logika (najosetljiviji deo sistema):**
  1. Provera preklapanja termina za istog `employeeId` (query po opsegu `startTime`/`endTime`, isključujući CANCELLED/REJECTED).
  2. Provera da je termin unutar `WorkingHours` (dayOfWeek se izvodi iz `startTime` nakon UTC→lokalne konverzije).
  3. Provera da je termin u budućnosti (`startTime > now(UTC)`).
  4. `serviceId` mora referencirati aktivan `CatalogItem` tipa `SERVICE`.
- Idempotency-Key header obavezan na `POST /reservations` (sekcija 13).
- CUSTOMER vidi samo svoje (`WHERE customerId = :currentUserId`), EMPLOYEE/ADMIN/OWNER vide sve.

**Testiranje:** Postman — preklapanje termina (409), van radnog vremena (400), termin u prošlosti (400), duplirani idempotency key (isti odgovor, ne duplira zapis).

**Izlaz faze:** Rezervacioni sistem potpuno validan i testiran.

---

### FAZA 5 — Order Modul (kompleksan modul, zavisi od Catalog)
**Preduslov:** Faza 3 (Catalog) obavezno; Faza 4 nije tehnički preduslov ali se logično nastavlja.
**Šta se pravi:**
- `Order` + `OrderItem` — samo `PRODUCT` tip iz kataloga sme ući u `OrderItem` (validacija u servisu, ne DTO anotacijom).
- Kalkulacija `lineTotal` i `totalPrice` **isključivo na backendu** — frontend šalje samo `productId` + `quantity`, cena se čita iz baze u trenutku kreiranja (sprečava manipulaciju cenom sa klijenta).
- Status mašina: CREATED → IN_PROGRESS → READY → COMPLETED (+ CANCELLED iz bilo kog ne-terminalnog stanja).
- Idempotency-Key obavezan na `POST /orders`.
- Optimistic locking (`@Version` na `Order` entitetu) — konkurentna promena statusa (npr. dva zaposlena istovremeno) vraća 409.
- MVP ograničenje: pickup only — nema polja za dostavu/adresu.

**Testiranje:** Postman — order sa SERVICE stavkom (400), konkurentna promena statusa (simulacija 409 preko dva paralelna requesta), tačnost `totalPrice`.

**Izlaz faze:** Order sistem kompletan i finansijski konzistentan.

---

### FAZA 6 — Dashboard Modul
**Preduslov:** Faze 2–5 (agregira podatke iz svih modula).
**Šta se pravi:**
- Agregatni read-only endpointi: broj rezervacija po statusu, dnevni promet, broj aktivnih narudžbina.
- **Performanse (sekcija 19):** koristiti native/JPQL agregatne upite (`GROUP BY`, `COUNT`, `SUM`) umesto povlačenja entiteta u memoriju i ručnog sabiranja — izbeći N+1 na relacijama Order→OrderItem.
- Rezultat se vraća kroz dedikovane `DashboardResponse` DTO-ove (projekcije), ne pune entitete.
- Vidljivost po roli: OWNER/ADMIN vide sve agregate; EMPLOYEE vidi operativni subset (današnje rezervacije/narudžbine).

**Testiranje:** Postman — provera brojeva na test setu podataka, provera da CUSTOMER nema pristup (403).

**Izlaz faze:** Kompletan MVP backend, potpuno testiran, spreman za integraciju.

---

### FAZA 7 — Cross-cutting Hardening (pre frontenda)
**Preduslov:** Faze 1–6 gotove.
**Šta se pravi:**
- Finalni prolaz kroz `@RestControllerAdvice`: potvrditi mapiranje svih grešaka (400/401/403/404/409/500) i da nijedan stack trace/lozinka/JWT/payment podatak ne izlazi u log ili response.
- Paginacija standardizovana na svim listing endpointima (`page`, `size` default 20/max 100, `sort`, `direction`).
- Review svih `@Transactional` granica — samo Service sloj, rollback na runtime exception.
- Kompletna Postman regresiona kolekcija (Newman) — "smoke test" pre svakog daljeg koraka.

**Izlaz faze:** Backend je stabilan, konzistentan i "zamrznut" API ugovor — spreman da frontend počne da se oslanja na njega.

---

### FAZA 8 — Frontend Bootstrap
**Preduslov:** Faza 7 završena (API ugovor stabilan).
**Šta se pravi:**
- Vite + React + TypeScript projekat.
- `api` sloj (axios/fetch wrapper + interceptor za JWT header + refresh/401 redirect na `/login`).
- `auth` kontekst (React Context ili Zustand) — čuva trenutnog usera i rolu, štiti rute.
- `routes` — `ProtectedRoute` komponenta bazirana na roli (mapiranje iz sekcije 9).
- `layout` — osnovni shell (sidebar/topbar) koji se menja po roli.

**Izlaz faze:** Prazna aplikacija sa radnim loginom i zaštićenim rutama.

---

### FAZA 9 — Frontend: Auth + Profile + Catalog (read)
**Preduslov:** Faza 8.
**Šta se pravi:** `/login`, `/register`, `/profile` stranice; `/catalog` prikaz (svi mogu videti, samo ADMIN/OWNER imaju edit dugmad).

### FAZA 10 — Frontend: Reservation + Order (Customer + Employee flow)
**Preduslov:** Faza 9.
**Šta se pravi:** `/my-reservations`, `/my-orders` (Customer), `/reservations`, `/orders` (Employee/Admin obradа statusa).

### FAZA 11 — Frontend: Employees + Dashboard (Owner/Admin)
**Preduslov:** Faza 10.
**Šta se pravi:** `/employees` (User CRUD UI), `/dashboard` sa grafikonima/karticama agregata.

### FAZA 12 — E2E Regresija & Deployment
**Preduslov:** sve prethodne faze.
**Šta se pravi:** Cypress/Playwright smoke testovi po roli, `mvn clean package` + `npm run build` pipeline, provera env varijabli i CORS na produkciji, HTTPS, monitoring (`/actuator/health`), backup procedura test-restore.

---

## 2. DETALJNA STRUKTURA BACKEND-A (Spring Boot, Package-by-Feature)

```
src/main/java/com/gmanager/
│
├── GManagerApplication.java
│
├── common/                         # deljeno, bez poslovne logike modula
│   ├── entity/
│   │   └── BaseEntity.java        # id, createdAt, updatedAt, @Version
│   ├── error/
│   │   ├── ApiError.java          # timestamp, status, error, message, path, requestId
│   │   ├── GlobalExceptionHandler.java   # @RestControllerAdvice
│   │   ├── BusinessException.java
│   │   ├── ResourceNotFoundException.java
│   │   └── ConflictException.java
│   ├── dto/
│   │   └── PageResponse.java      # page, size, totalElements, content
│   └── util/
│       └── DateTimeUtils.java     # UTC <-> lokalno vreme helperi
│
├── security/
│   ├── JwtService.java            # generate/parse/validate token
│   ├── JwtAuthenticationFilter.java  # čita userId iz tokena, učitava usera IZ BAZE
│   ├── SecurityConfig.java        # SecurityFilterChain, rute po roli
│   ├── CurrentUserProvider.java   # helper: SecurityContext -> User entity
│   └── RateLimitFilter.java       # login/register throttling
│
├── auth/
│   ├── AuthController.java        # POST /api/v1/auth/login, /register
│   ├── AuthService.java
│   └── dto/
│       ├── LoginRequest.java      # email: String, password: String
│       ├── RegisterRequest.java   # name, email, password: String
│       └── AuthResponse.java      # token: String, expiresAt: Instant
│
├── user/
│   ├── User.java                  # entity: extends BaseEntity
│   │                               #   name: String, email: String,
│   │                               #   passwordHash: String, role: Role (enum),
│   │                               #   active: boolean
│   ├── Role.java                  # enum: OWNER, ADMIN, EMPLOYEE, CUSTOMER
│   ├── UserController.java        # /api/v1/users, /api/v1/users/me
│   ├── UserService.java           # role-hijerarhija pravila (ADMIN ne dira OWNER)
│   ├── UserRepository.java
│   └── dto/
│       ├── CreateUserRequest.java # name: String, email: String, password: String, role: Role
│       ├── UpdateUserRequest.java # name: String, active: Boolean
│       └── UserResponse.java      # id: UUID, name, email, role, active, createdAt: Instant
│                                   # (BEZ passwordHash polja!)
│
├── catalog/
│   ├── CatalogItem.java           # entity: name, description, type (enum), price: BigDecimal,
│   │                               #   durationMinutes: Integer (nullable), active: boolean
│   ├── ItemType.java               # enum: PRODUCT, SERVICE
│   ├── CatalogController.java     # /api/v1/catalog
│   ├── CatalogService.java        # validacija: SERVICE->duration obavezan, PRODUCT->duration null
│   ├── CatalogRepository.java
│   └── dto/
│       ├── CreateCatalogItemRequest.java  # name, description, type, price: BigDecimal, durationMinutes: Integer
│       ├── UpdateCatalogItemRequest.java
│       └── CatalogItemResponse.java       # id, name, type, price: BigDecimal, durationMinutes, active
│
├── reservation/
│   ├── Reservation.java           # customerId: UUID, employeeId: UUID, serviceId: UUID,
│   │                               #   startTime: Instant, endTime: Instant,
│   │                               #   status: ReservationStatus, note: String
│   ├── ReservationStatus.java     # enum: PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED
│   ├── WorkingHours.java          # dayOfWeek: DayOfWeek, openTime: LocalTime, closeTime: LocalTime, active
│   ├── ReservationController.java # /api/v1/reservations
│   ├── ReservationService.java    # preklapanje, radno vreme, budućnost — sva pravila ovde
│   ├── ReservationRepository.java # custom query: findOverlapping(employeeId, start, end)
│   ├── WorkingHoursRepository.java
│   └── dto/
│       ├── CreateReservationRequest.java  # employeeId: UUID, serviceId: UUID,
│       │                                   #   startTime: Instant, note: String
│       ├── UpdateReservationStatusRequest.java  # status: ReservationStatus
│       └── ReservationResponse.java       # id, customerId, employeeId, serviceId,
│                                            #   startTime: Instant, endTime: Instant, status, note
│
├── order/
│   ├── Order.java                 # customerId: UUID, handledBy: UUID, status: OrderStatus,
│   │                               #   totalPrice: BigDecimal, @Version version: Long
│   ├── OrderItem.java              # orderId, productId, quantity: Integer,
│   │                               #   unitPrice: BigDecimal, lineTotal: BigDecimal
│   ├── OrderStatus.java            # enum: CREATED, IN_PROGRESS, READY, COMPLETED, CANCELLED
│   ├── OrderController.java       # /api/v1/orders
│   ├── OrderService.java          # cena SAMO iz baze, PRODUCT-only validacija, status mašina
│   ├── OrderRepository.java
│   ├── OrderItemRepository.java
│   └── dto/
│       ├── CreateOrderRequest.java        # items: List<OrderItemRequest>
│       ├── OrderItemRequest.java          # productId: UUID, quantity: Integer  (BEZ cene!)
│       ├── UpdateOrderStatusRequest.java  # status: OrderStatus
│       └── OrderResponse.java             # id, status, totalPrice: BigDecimal,
│                                            #   items: List<OrderItemResponse>, createdAt: Instant
│
├── dashboard/
│   ├── DashboardController.java   # /api/v1/dashboard
│   ├── DashboardService.java      # agregatni upiti, role-scoped rezultati
│   ├── DashboardRepository.java   # JPQL/native GROUP BY upiti
│   └── dto/
│       └── DashboardSummaryResponse.java  # totalOrdersToday, totalRevenueToday: BigDecimal,
│                                            #   reservationsByStatus: Map<String, Long>
│
└── idempotency/
    ├── IdempotencyKey.java         # entity: key: String, requestHash, responseBody, createdAt
    ├── IdempotencyInterceptor.java # čita Idempotency-Key header, cache-uje response
    └── IdempotencyRepository.java

src/main/resources/
├── application.yml
├── application-local.yml
├── application-prod.yml
└── db/migration/
    ├── V1__init_schema.sql
    ├── V2__seed_working_hours.sql
    └── ...
```

**Napomena o izolaciji modula (sekcije 3, 6, 29):** repozitorijumi jednog modula se **nikada** ne injektuju direktno u servis drugog modula. Ako `OrderService` treba podatak iz `catalog`, poziva **`CatalogService`** (javni ugovor modula), a ne `CatalogRepository` direktno. Ovo je granica koja se mora ispoštovati kroz code review.

---

## 3. DETALJNA STRUKTURA FRONTEND-A (React + TypeScript)

```
src/
├── main.tsx
├── App.tsx                        # Router setup
│
├── api/
│   ├── client.ts                  # axios instance + JWT interceptor + 401 handler
│   ├── authApi.ts                 # login, register
│   ├── userApi.ts
│   ├── catalogApi.ts
│   ├── reservationApi.ts
│   ├── orderApi.ts
│   └── dashboardApi.ts
│
├── auth/
│   ├── AuthContext.tsx            # currentUser, role, login(), logout()
│   ├── useAuth.ts                 # hook
│   └── ProtectedRoute.tsx         # role-based guard (redirect ako nema pristup)
│
├── layout/
│   ├── AppShell.tsx                # sidebar + topbar wrapper
│   ├── Sidebar.tsx                 # meni se generiše dinamički na osnovu role
│   └── Topbar.tsx
│
├── routes/
│   └── AppRoutes.tsx               # centralna definicija ruta + role mapping
│
├── pages/
│   ├── public/
│   │   ├── LoginPage.tsx           # /login
│   │   └── RegisterPage.tsx        # /register
│   │
│   ├── shared/
│   │   └── ProfilePage.tsx         # /profile  (svi autentifikovani)
│   │
│   ├── owner-admin/                # role: OWNER, ADMIN
│   │   ├── DashboardPage.tsx       # /dashboard
│   │   ├── EmployeesPage.tsx       # /employees  (User CRUD)
│   │   ├── CatalogManagementPage.tsx  # /catalog (full CRUD)
│   │   ├── OrdersManagementPage.tsx   # /orders (svi orderi, promena statusa)
│   │   └── ReservationsManagementPage.tsx  # /reservations (sve rezervacije)
│   │
│   ├── employee/                   # role: EMPLOYEE
│   │   ├── EmployeeDashboardPage.tsx   # /dashboard (operativni subset)
│   │   ├── EmployeeOrdersPage.tsx      # /orders (obrada)
│   │   ├── EmployeeReservationsPage.tsx  # /reservations (potvrda/odbijanje)
│   │   └── CatalogReadOnlyPage.tsx     # /catalog (read-only)
│   │
│   └── customer/                   # role: CUSTOMER
│       ├── CatalogBrowsePage.tsx   # /catalog
│       ├── MyOrdersPage.tsx        # /my-orders
│       ├── MyReservationsPage.tsx  # /my-reservations
│       └── NewReservationPage.tsx  # kreiranje termina
│
├── components/
│   ├── catalog/
│   │   ├── CatalogItemCard.tsx
│   │   └── CatalogItemForm.tsx     # razlikuje PRODUCT/SERVICE polja (duration)
│   ├── reservation/
│   │   ├── ReservationCalendar.tsx  # prikaz radnog vremena + zauzetih termina
│   │   ├── ReservationStatusBadge.tsx
│   │   └── ReservationForm.tsx
│   ├── order/
│   │   ├── OrderCart.tsx            # quantity picker, cena SAMO prikazna (read-only)
│   │   ├── OrderStatusBadge.tsx
│   │   └── OrderItemsTable.tsx
│   ├── user/
│   │   ├── UserTable.tsx
│   │   └── UserForm.tsx
│   ├── dashboard/
│   │   ├── SummaryCard.tsx
│   │   └── StatusBreakdownChart.tsx
│   └── common/
│       ├── PaginatedTable.tsx      # generička tabela (page/size/sort/direction)
│       ├── ErrorBanner.tsx         # mapira ApiError DTO na poruku
│       └── LoadingSpinner.tsx
│
└── types/
    ├── user.types.ts
    ├── catalog.types.ts
    ├── reservation.types.ts
    ├── order.types.ts
    └── api.types.ts                 # ApiError, PageResponse<T>
```

**Mapiranje ruta ↔ role (direktno iz sekcije 9):**

| Ruta | OWNER | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|---|
| `/profile` | ✅ | ✅ | ✅ | ✅ |
| `/dashboard` | ✅ (pun) | ✅ (pun) | ✅ (operativni subset) | ❌ |
| `/employees` | ✅ | ✅ (bez OWNER-a) | ❌ | ❌ |
| `/catalog` | ✅ CRUD | ✅ CRUD | 👁 read-only | 👁 browse |
| `/orders` | ✅ sve | ✅ sve | ✅ obrada | `/my-orders` samo svoje |
| `/reservations` | ✅ sve | ✅ sve | ✅ potvrda | `/my-reservations` samo svoje |

---

## 4. KLJUČNA UKAZIVANJA NA BIZNIS LOGIKU

**1. Idempotency-Key (Order i Reservation create)**
Implementirati kao `HandlerInterceptor` ili filter koji presreće `POST /api/v1/orders` i `POST /api/v1/reservations`:
- Ako header nedostaje → 400.
- Ako je key već viđen → vratiti **isti prethodni response** (cache-ovan u `idempotency_key` tabeli: key, hash tela zahteva, serijalizovan response, status), bez ponovnog izvršavanja servisne logike.
- Ako je isti key poslat sa **drugačijim** telom zahteva → 409/422 (konflikt idempotency ugovora).
- TTL na zapisima (npr. 24h) da tabela ne raste neograničeno.

**2. Optimistic Locking (`@Version`)**
- Dodati `@Version private Long version;` na `Order` (i po potrebi `Reservation` ako se očekuje konkurentna promena statusa od strane više zaposlenih).
- `OptimisticLockException` mora biti **eksplicitno uhvaćen** u `GlobalExceptionHandler` i mapiran u **409 Conflict** koristeći `ApiError` format iz sekcije 8 — ne sme procuriti kao 500.
- Frontend na 409 mora ponuditi "refresh & retry" UX (ne tihi retry, jer korisnik treba da vidi novo stanje).

**3. Radno vreme i UTC konverzija (Reservation)**
- **Baza i backend logika rade isključivo u UTC** (`Instant`). `WorkingHours` se čuva kao `LocalTime` + `DayOfWeek` **u lokalnoj vremenskoj zoni biznisa** (konfigurabilno, npr. `Europe/Belgrade`), jer radno vreme ima smisla samo u lokalnom kontekstu.
- Validacija u `ReservationService`: `Instant startTime` (UTC) → konvertovati u `ZonedDateTime` biznis-zone → izvući `DayOfWeek` i `LocalTime` → uporediti sa `WorkingHours` zapisom za taj dan.
- **Kritična zamka:** DST (letnje/zimsko računanje vremena) menja offset tokom godine — koristiti `ZoneId`, nikada fiksni offset (`+01:00`), da se izbegnu bag-ovi oko martovske/oktobarske promene.
- Frontend šalje `Instant` (ISO-8601 UTC) sa svakim zahtevom; sav prikaz lokalnog vremena (formatiranje) dešava se **samo na frontendu**, backend nikad ne vraća lokalno vreme kao string.

**4. Kalkulacija cena na backendu (Order)**
- `CreateOrderRequest` sme sadržati **samo** `productId` i `quantity` — nikad `unitPrice` sa klijenta.
- `OrderService` u istoj transakciji: učitava `CatalogItem` po `productId`, proverava `active == true` i `type == PRODUCT`, uzima `price` iz baze kao `unitPrice`, računa `lineTotal = unitPrice * quantity`, i `totalPrice = SUM(lineTotal)`.
- Sve novčane vrednosti kao **`BigDecimal`** (nikad `double`/`float`) da se izbegnu greške zaokruživanja — uključujući DTO-ove i JSON serijalizaciju (Jackson: `BigDecimal` se serijalizuje kao broj, ne string, osim ako se eksplicitno ne zahteva drugačije).
- Ova provera mora biti u `@Transactional` metodi da bi race condition (item postane inactive/promeni cenu tokom kreiranja) bio pokriven zajedno sa optimistic locking proverom.

---

### Kritični redosled zavisnosti (sažetak)
`common → security → auth → user → catalog → (reservation | order) → dashboard → frontend`

Svaka faza se zatvara tek kada Postman regresija prođe 100% — tek tada se prelazi dalje. Ovo sprečava da se greške u fundamentima (auth, role provera) prenesu i multiplikuju kroz kompleksnije module (reservation, order).
