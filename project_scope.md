G-Manager — Full System Specification
1. SYSTEM OVERVIEW

G-Manager je univerzalni sistem za upravljanje lokalnim biznisom.

Podržava:

upravljanje korisnicima i rolama
katalog proizvoda i usluga
rezervacije termina
narudžbine (pickup)
osnovni dashboard
2. ROLE MODEL
OWNER
potpuna kontrola sistema
upravlja ADMIN i EMPLOYEE
vidi sve podatke
menja sistemska podešavanja
ADMIN
upravlja zaposlenima (ne OWNER)
upravlja katalogom
vidi sve narudžbine i rezervacije
menja statuse
EMPLOYEE
vidi operativne podatke
obrađuje narudžbine
potvrđuje rezervacije
nema upravljanje korisnicima
CUSTOMER
vidi svoj profil
vidi katalog
pravi narudžbine
pravi rezervacije
vidi samo svoje podatke
3. CORE MODULES
auth
user
catalog
reservation
order
dashboard
security
common
4. DOMAIN MODELS
User
id
name
email
passwordHash
role
active
createdAt
updatedAt
CatalogItem
id
name
description
type (PRODUCT | SERVICE)
price
durationMinutes
active
createdAt
updatedAt
Reservation
id
customerId
employeeId
serviceId
startTime
endTime
status
note
createdAt
updatedAt
Order
id
customerId
handledBy
status
totalPrice
createdAt
updatedAt
OrderItem
id
orderId
productId
quantity
unitPrice
lineTotal
WorkingHours
dayOfWeek
openTime
closeTime
active
5. STATUS MODELS
Reservation
PENDING
CONFIRMED
REJECTED
CANCELLED
COMPLETED
Order
CREATED
IN_PROGRESS
READY
COMPLETED
CANCELLED
6. CORE RULES
General
- Backend je jedini izvor istine
- Frontend ne određuje logiku
- Service layer sadrži poslovnu logiku
- Repository pristup samo unutar modula
Catalog
PRODUCT → ide u Order
SERVICE → ide u Reservation

SERVICE mora imati duration
PRODUCT ne sme imati reservation

inactive → ne može se koristiti
Reservation
- nema preklapanja za istog zaposlenog
- mora biti u radnom vremenu
- mora biti u budućnosti
- CUSTOMER vidi samo svoje
Order
- samo PRODUCT ide u order
- total se računa na backendu
- CUSTOMER vidi samo svoje
- pickup only (MVP)
7. API PRINCIPLES
REST
/api/v1/*
DTO-based
standard error format
8. ERROR MODEL
{
  "timestamp": "...",
  "status": 400,
  "error": "Bad Request",
  "message": "...",
  "path": "...",
  "requestId": "..."
}
9. FRONTEND STRUCTURE
/pages
/components
/api
/auth
/layout
/routes
Routes
Public
/login
/register
Authenticated
/profile
OWNER / ADMIN
/dashboard
/employees
/catalog
/orders
/reservations
EMPLOYEE
/dashboard
/orders
/reservations
/catalog (read-only)
CUSTOMER
/catalog
/my-orders
/my-reservations
/profile
10. SYSTEM ARCHITECTURE
Frontend
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
Database
11. TRANSACTIONS
- samo Service layer koristi @Transactional
- rollback na runtime exception
12. CONCURRENCY
- optimistic locking (@Version)
- 409 Conflict na konflikt
13. IDEMPOTENCY
- Idempotency-Key header
- kritični endpointi:
  - order create
  - reservation create
  - payment
14. PAGINATION
page
size
sort
direction

default:

size = 20
max = 100
15. TIMEZONE
- backend: UTC
- frontend: lokalno
- reservation koristi timezone konverziju
16. LOGGING
INFO  → normalne operacije
WARN  → sumnjivo ponašanje
ERROR → greške

Ne logovati:

password
JWT
payment podaci
17. EXCEPTION HANDLING
@RestControllerAdvice

Mapiranje:

400 BadRequest
401 Unauthorized
403 Forbidden
404 NotFound
409 Conflict
500 Internal Error
18. VALIDATION

Slojevi:

DTO → annotations
Service → business logic
DB → constraints
19. PERFORMANCE
- izbegavati N+1
- koristiti DTO
- koristiti indekse
- agregatni query za dashboard
20. SECURITY
JWT authentication
role authorization
active user check

Pravila:

- ne verovati role iz tokena
- uvek čitati user iz baze
21. DEPLOYMENT

Env:

DB_URL
DB_USERNAME
DB_PASSWORD
JWT_SECRET
CORS_ALLOWED_ORIGINS

Build:

mvn clean package
npm run build
22. MONITORING
/actuator/health

Praćenje:

error rate
response time
DB connection
23. BACKUP
daily backup
restore procedura
test restore
24. RATE LIMITING
login: 5 pokušaja / 10 min
register: 10 / sat
order/reservation: 30 / min
25. DATA RETENTION
users → soft delete
orders → dugoročno
reservations → 2 godine
logs → 30-90 dana
audit → 1+ godina
26. PRODUCTION SECURITY
HTTPS obavezan
CORS ograničen
JWT secret jak
nema hardcoded secrets
27. MVP SCOPE
auth
user
catalog
reservation
order
dashboard
28. POST-MVP
payment
fiscalization
notifications
multi-organization
delivery
audit
reports
advanced scheduling
29. FINAL PRINCIPLES
Backend kontroliše logiku
Frontend je samo UI
Service layer je centar sistema
Svaki modul je izolovan
Autorizacija je obavezna svuda
Podaci su konzistentni i validirani
30. IMPLEMENTATION READY STATE
Sve funkcionalne, sistemske i produkcione definicije postoje.
Sistem je spreman za direktnu implementaciju bez dodatnih nepoznatih.