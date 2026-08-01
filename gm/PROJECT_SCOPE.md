Dokument definiše jasnu "Backend First" arhitekturu sa izolovanim modulima, servisnim slojem kao centrom poslovne logike, DTO-orijentisanim REST API-jem i frontendom koji predstavlja isključivo prezentacioni sloj.

1. Korak-po-korak plan razvoja (Backend First)
   Faza 0 — Infrastruktura projekta
   Cilj

Napraviti stabilnu osnovu.

Implementirati
Spring Boot 3
Java 21
PostgreSQL
Flyway
Spring Data JPA
Spring Security
JWT
Validation
Actuator
Lombok
MapStruct
Global Exception Handler
Standard Error Response
OpenAPI (Swagger)
Preduslov

Ništa.

Faza 1 — Common modul

Ovaj modul koriste svi ostali.

Implementirati:

BaseEntity
ApiError
GlobalExceptionHandler
Pagination util
RequestId filter
Mapper konfiguracije
Audit polja
UTC konfiguracija
Custom Exceptions

Posle ove faze svi moduli koriste istu infrastrukturu.

Faza 2 — Security + Auth

Implementirati:

JWT Authentication
JWT Filter
JWT Provider
UserDetailsService
PasswordEncoder
Login
Register
Refresh Token (po želji)
Role Authorization
Active User Validation

Ovde implementirati pravilo:

Role iz JWT se koristi samo za identifikaciju, dok se kompletan korisnik uvek učitava iz baze.

Faza 3 — User modul

Implementirati:

User CRUD
Role management
Soft delete
Profile
Employee management
Owner/Admin pravila

Tek kada User radi može se razvijati ostatak sistema.

Faza 4 — Catalog modul

Implementirati:

Product CRUD
Service CRUD
Search
Pagination
Aktivacija/deaktivacija

Business pravila:

PRODUCT → Order
SERVICE → Reservation
SERVICE mora imati duration
inactive nije dozvoljen
Faza 5 — Working Hours

Napraviti zaseban modul ili podmodul Catalog-a.

Implementirati:

WorkingHours CRUD
Radno vreme
UTC validaciju

Kasnije Reservation koristi ovaj modul.

Faza 6 — Reservation

Najkompleksniji modul.

Implementirati:

Create Reservation
Confirm
Reject
Cancel
Complete
Pregled po rolama

Business validacije:

nema preklapanja
u budućnosti
u radnom vremenu
SERVICE mora biti aktivan

Ovde implementirati:

Optimistic Locking
Idempotency
UTC konverziju
Faza 7 — Order

Implementirati:

Create Order
Add Items
Status Workflow
Customer Orders
Employee Processing

Business pravila:

samo PRODUCT
backend računa total
pickup only

Ovde implementirati:

Idempotency
Optimistic Locking
Faza 8 — Dashboard

Implementirati agregatne upite:

broj korisnika
broj rezervacija
broj narudžbina
dnevni promet
aktivni proizvodi
aktivne usluge

Koristiti DTO projekcije umesto učitavanja entiteta.

Faza 9 — Frontend

Tek sada počinje React.

Redosled:

Login
JWT
Routing
Layout
Catalog
User
Reservation
Order
Dashboard

Frontend koristi isključivo REST API.

Faza 10 — Testiranje
Unit test
Service test
Repository test
Security test
Integration test
API test
Faza 11 — Produkcija
Docker
Flyway migration
HTTPS
CORS
Environment Variables
Monitoring
Backup
2. Backend struktura (Package-by-Feature)
   src/main/java/com/gmanager
   │
   ├── common
   │   ├── config
   │   ├── exception
   │   ├── dto
   │   ├── mapper
   │   ├── pagination
   │   ├── util
   │   └── entity
   │
   ├── security
   │   ├── config
   │   ├── jwt
   │   ├── filter
   │   ├── service
   │   └── handler
   │
   ├── auth
   │   ├── controller
   │   ├── service
   │   ├── dto
   │   │   ├── LoginRequest
   │   │   ├── RegisterRequest
   │   │   ├── LoginResponse
   │   │   └── JwtResponse
   │   └── mapper
   │
   ├── user
   │   ├── controller
   │   ├── service
   │   ├── repository
   │   ├── model
   │   ├── dto
   │   ├── mapper
   │   └── specification
   │
   ├── catalog
   │   ├── controller
   │   ├── service
   │   ├── repository
   │   ├── model
   │   ├── dto
   │   ├── mapper
   │   └── validation
   │
   ├── reservation
   │   ├── controller
   │   ├── service
   │   ├── repository
   │   ├── model
   │   ├── dto
   │   ├── mapper
   │   ├── validator
   │   └── scheduler
   │
   ├── order
   │   ├── controller
   │   ├── service
   │   ├── repository
   │   ├── model
   │   ├── dto
   │   ├── mapper
   │   └── calculator
   │
   ├── dashboard
   │   ├── controller
   │   ├── service
   │   ├── repository
   │   └── dto
   │
   └── GManagerApplication
   Uloga paketa
   Paket	Uloga
   controller	REST endpoint-i
   service	Poslovna logika i @Transactional metode
   repository	Isključivo pristup bazi unutar modula
   model	JPA entiteti
   dto	Request/Response modeli
   mapper	MapStruct konverzije
   validator	Poslovne validacije specifične za modul
   calculator	Kalkulacija cena narudžbine
   specification	Dinamički filteri i pretraga
   DTO konvencije
   Request DTO

Koriste se za ulazne podatke.

Primeri:

CreateUserRequest
UpdateUserRequest
CreateCatalogItemRequest
CreateReservationRequest
CreateOrderRequest
LoginRequest

Tipovi:

String
UUID
Boolean
Integer
Long
BigDecimal
Instant
List<T>
Response DTO

Primeri:

UserResponse
CatalogItemResponse
ReservationResponse
OrderResponse
DashboardResponse
LoginResponse

Tipovi:

UUID
String
BigDecimal
Instant
Boolean
Enum
List<T>

Za vremenske podatke koristiti Instant (UTC), uz konverziju u lokalnu vremensku zonu na frontend-u.

3. Frontend struktura (React)
   src
   │
   ├── api
   │   ├── authApi.ts
   │   ├── userApi.ts
   │   ├── catalogApi.ts
   │   ├── reservationApi.ts
   │   ├── orderApi.ts
   │   └── dashboardApi.ts
   │
   ├── auth
   │   ├── AuthProvider.tsx
   │   ├── ProtectedRoute.tsx
   │   ├── RoleGuard.tsx
   │   └── token.ts
   │
   ├── layout
   │   ├── MainLayout.tsx
   │   ├── Sidebar.tsx
   │   ├── Navbar.tsx
   │   └── Footer.tsx
   │
   ├── routes
   │   ├── AppRoutes.tsx
   │   ├── PublicRoutes.tsx
   │   └── PrivateRoutes.tsx
   │
   ├── pages
   │   ├── auth
   │   ├── owner
   │   ├── admin
   │   ├── employee
   │   ├── customer
   │   └── shared
   │
   ├── components
   │   ├── forms
   │   ├── tables
   │   ├── cards
   │   ├── dialogs
   │   ├── inputs
   │   ├── loaders
   │   └── common
   │
   ├── hooks
   ├── utils
   ├── types
   └── assets
   Mapa stranica po rolama
   Public
   LoginPage
   RegisterPage
   Shared
   ProfilePage
   Owner
   DashboardPage
   EmployeesPage
   CatalogPage
   OrdersPage
   ReservationsPage
   UsersPage
   SettingsPage
   Admin
   DashboardPage
   EmployeesPage
   CatalogPage
   OrdersPage
   ReservationsPage
   Employee
   DashboardPage
   OrdersPage
   ReservationsPage
   CatalogReadOnlyPage
   Customer
   CatalogPage
   MyOrdersPage
   MyReservationsPage
   ProfilePage

Ovo direktno prati definisanu strukturu ruta i pristup po ulogama.

4. Ključna mesta implementacije poslovne logike
   Pravilo	Mesto implementacije
   Idempotency-Key	Servlet filter ili interceptor + servisni sloj za POST /orders i POST /reservations; čuvanje ključa i odgovora radi sprečavanja duplih zahteva.
   Optimistic Locking	Dodati @Version u entitete (User, CatalogItem, Reservation, Order) i mapirati OptimisticLockException na HTTP 409.
   Validacija radnog vremena	ReservationService: konverzija korisničkog vremena u Instant (UTC), provera da termin nije u prošlosti, da je unutar WorkingHours i da nema preklapanja za zaposlenog.
   Kalkulacija cena	OrderService/OrderCalculator: učitavanje aktuelnih cena proizvoda iz baze, izračunavanje lineTotal i totalPrice; klijent nikada ne šalje konačan iznos.
   Transakcije	Sve poslovne operacije (createOrder, createReservation, promene statusa) označiti sa @Transactional; repozitorijumi ne upravljaju transakcijama.
   Validacija	DTO sloj (@NotBlank, @Email, @Positive), servisni sloj za poslovna pravila, baza za jedinstvenost i referencijalni integritet.

Ovakav redosled razvoja minimizuje međuzavisnosti: prvo se završava infrastruktura i bezbednost, zatim nezavisni domeni (user, catalog), potom složeniji transakcioni moduli (reservation, order), nakon čega se implementiraju agregacije za dashboard i tek na kraju React aplikacija koja se oslanja na stabilan i kompletan REST API.