# G-Manager — Funkcionalna Specifikacija (End-to-End Flows)

**Svrha dokumenta:** Referenca za implementaciju i testiranje (Postman kolekcije 1:1 prate ovu numeraciju). Svaki FR (Functional Requirement) je testabilna jedinica.

**Konvencije koje važe za SVE flow-ove ispod (ne ponavljaju se u svakom FR-u):**
- Sve rute su prefiksovane sa `/api/v1`.
- Svaki zahtev prvo prolazi kroz `JwtAuthenticationFilter` → ako token nedostaje/nevalidan/istekao → **401 Unauthorized**, pre nego što request uopšte stigne do kontrolera.
- Filter učitava `User` **iz baze** po `userId` iz tokena; ako `active == false` → **401 Unauthorized** ("nalog je deaktiviran"), bez obzira što je token strukturno validan.
- Nakon autentifikacije, `@PreAuthorize`/servisna provera role → ako rola ne odgovara → **403 Forbidden**.
- Svaki neuspeo Bean Validation na DTO nivou (npr. `@NotBlank`, `@Email`) → **400 Bad Request** sa listom polja u `message`.
- Svaki `ResourceNotFoundException` (entitet ne postoji) → **404 Not Found**.
- Svaka greška u `ApiError` formatu (sekcija 8 specifikacije): `timestamp, status, error, message, path, requestId`.

---

# MODUL 1 — AUTH & USER MANAGEMENT

## FR-AUTH-01 — Registracija novog korisnika (CUSTOMER)

**1. Rola:** Javno dostupno (bez autentifikacije). Registracija kroz ovaj endpoint **uvek** kreira korisnika sa rolom `CUSTOMER` — ne postoji polje `role` u request DTO-u.

**2. Ulaz:** `POST /api/v1/auth/register`
```json
{ "name": "Marko Marković", "email": "marko@example.com", "password": "Sifra123!" }
```

**3. Backend flow:**
- Bean Validation: `name` @NotBlank, `email` @Email @NotBlank, `password` @NotBlank @Size(min=8).
- `AuthService`: provera da `email` već ne postoji u bazi (`UserRepository.existsByEmail`) → ako postoji, prekid.
- `password` → `BCryptPasswordEncoder.encode()`.
- Transakcija: `INSERT` u `user` tabelu — `role = CUSTOMER`, `active = true`.
- Rate limiting: max 10 registracija/sat po IP (sekcija 24) — proverava se **pre** ulaska u servis (filter/interceptor nivo).

**4. Uspešan odgovor:** `201 Created`
```json
{ "id": "uuid", "name": "...", "email": "...", "role": "CUSTOMER" }
```
(bez `passwordHash`, bez auto-login tokena — korisnik se posle registracije eksplicitno loguje).

**5. Edge-case-ovi:**
- Email već postoji → **409 Conflict** ("email je već registrovan") — namerno 409 a ne 400, jer je zahtev strukturno ispravan ali stanje sistema (postojeći resurs) ga sprečava.
- Prekoračen rate limit → **429 Too Many Requests**.
- Neispravan email format / kratka lozinka → **400 Bad Request**.

---

## FR-AUTH-02 — Login (izdavanje JWT tokena)

**1. Rola:** Javno dostupno.

**2. Ulaz:** `POST /api/v1/auth/login`
```json
{ "email": "marko@example.com", "password": "Sifra123!" }
```

**3. Backend flow:**
- Učitati `User` po `email`. Ako ne postoji → generička poruka greške (ne otkrivati da li email postoji, radi bezbednosti).
- Proveriti `active == true` — ako `false` → odbiti login istom generičkom porukom.
- `BCryptPasswordEncoder.matches(rawPassword, user.passwordHash)`.
- Ako uspešno: `JwtService.generateToken(user.id, user.role)` — token nosi **samo** `sub=userId` (i eventualno `exp`), **ne** rolu kao trajni claim koji se slepo veruje (rola se i dalje uvek re-proverava iz baze na svakom sledećem requestu).
- Rate limiting: max 5 pokušaja/10min po email+IP kombinaciji (sekcija 24) — nakon prekoračenja, blokirati dalje pokušaje bez obzira na tačnost lozinke.

**4. Uspešan odgovor:** `200 OK`
```json
{ "token": "eyJhbGciOi...", "expiresAt": "2026-07-27T10:00:00Z" }
```

**5. Edge-case-ovi:**
- Pogrešan email ili lozinka → **401 Unauthorized** ("neispravni kredencijali" — namerno ista poruka za oba slučaja, da se ne otkriva da li email postoji).
- Deaktiviran nalog → **401 Unauthorized** (ista generička poruka, iz istog bezbednosnog razloga).
- Prekoračen rate limit → **429 Too Many Requests**.

---

## FR-USER-01 — Kreiranje EMPLOYEE/ADMIN naloga

**1. Rola:** OWNER (kreira ADMIN i EMPLOYEE), ADMIN (kreira samo EMPLOYEE).

**2. Ulaz:** `POST /api/v1/users`
```json
{ "name": "Ana Anić", "email": "ana@gmanager.rs", "password": "Temp1234!", "role": "EMPLOYEE" }
```

**3. Backend flow:**
- `@PreAuthorize("hasAnyRole('OWNER','ADMIN')")`.
- **Servisna provera hijerarhije** (ne postoji kao anotacija — mora biti eksplicitan kod u `UserService`):
  - Ako `currentUser.role == ADMIN` i `request.role == OWNER` ili `request.role == ADMIN` → odbiti (ADMIN sme kreirati samo EMPLOYEE).
  - `CUSTOMER` rola se **ne** kreira kroz ovaj endpoint (ide kroz `/auth/register`).
- Provera jedinstvenosti email-a.
- `INSERT` u `user` tabelu, `active = true` po default-u.

**4. Uspešan odgovor:** `201 Created` — `UserResponse` (bez `passwordHash`).

**5. Edge-case-ovi:**
- ADMIN pokušava kreirati OWNER/ADMIN → **403 Forbidden**.
- Email zauzet → **409 Conflict**.
- EMPLOYEE ili CUSTOMER pokuša pristup ovom endpointu → **403 Forbidden**.

---

## FR-USER-02 — Pregled liste korisnika (paginirano)

**1. Rola:** OWNER, ADMIN.

**2. Ulaz:** `GET /api/v1/users?page=0&size=20&sort=name&direction=ASC&role=EMPLOYEE`

**3. Backend flow:**
- `@PreAuthorize("hasAnyRole('OWNER','ADMIN')")`.
- Paginacija po standardnoj konvenciji (sekcija 14): `size` default 20, max 100 (vrednost preko 100 se **skraćuje** na 100 na servisnom nivou, ne baca grešku).
- Opcioni filter po `role` i `active`.
- ADMIN u rezultatima **ne vidi** OWNER zapise (filtrira se na nivou upita, ne samo na frontendu) — sprečava informaciono curenje o postojanju/broju OWNER naloga ADMIN-u.

**4. Uspešan odgovor:** `200 OK` — `PageResponse<UserResponse>` (`content`, `page`, `size`, `totalElements`).

**5. Edge-case-ovi:**
- EMPLOYEE/CUSTOMER pristup → **403 Forbidden**.
- Nepostojeći `sort` field → **400 Bad Request** (whitelist dozvoljenih polja u servisu, ne slepo prosleđivanje u JPQL).

---

## FR-USER-03 — Pregled/izmena sopstvenog profila

**1. Rola:** Svi autentifikovani (OWNER, ADMIN, EMPLOYEE, CUSTOMER) — samo nad **sopstvenim** nalogom.

**2. Ulaz:** `GET /api/v1/users/me` i `PATCH /api/v1/users/me` `{ "name": "Novo Ime" }`

**3. Backend flow:**
- `userId` se **uvek** uzima iz `SecurityContext` (JWT `sub`), **nikad** iz path/body parametra — sprečava IDOR (Insecure Direct Object Reference) napad gde bi korisnik pokušao da izmeni tuđ profil slanjem tuđeg ID-a.
- `PATCH` dozvoljava izmenu **samo** `name` (i eventualno lozinke kroz poseban `/users/me/password` endpoint sa obaveznom trenutnom lozinkom) — **ne** `role`, **ne** `active`, **ne** `email` (email promena bi zahtevala poseban verifikacioni flow, van MVP-a).

**4. Uspešan odgovor:** `200 OK` — ažuriran `UserResponse`.

**5. Edge-case-ovi:**
- Pokušaj slanja `role`/`active` polja u telu → servis ta polja **ignoriše** (ne baca grešku, samo ih ne primenjuje) ili baca **400** ako DTO strogo ne dozvoljava ta polja (preporuka: DTO na nivou tipa nema ta polja, pa je ignorisanje automatsko).

---

## FR-USER-04 — Deaktivacija korisnika (soft delete)

**1. Rola:** OWNER (deaktivira ADMIN/EMPLOYEE/CUSTOMER), ADMIN (deaktivira samo EMPLOYEE).

**2. Ulaz:** `PATCH /api/v1/users/{id}/deactivate`

**3. Backend flow:**
- Ista hijerarhijska provera kao FR-USER-01.
- `active = false` (fizičko brisanje **nikad** — sekcija 25, `users → soft delete`).
- Svi budući JWT tokeni tog korisnika automatski postaju nevažeći **efektivno**, jer `JwtAuthenticationFilter` na svakom sledećem requestu učitava `active` iz baze i odbija pristup — nema potrebe za eksplicitnom token blacklistom.
- Korisnik se ne sme sam deaktivirati (`id == currentUser.id` → odbiti, sprečava slučajno samo-zaključavanje OWNER-a).

**4. Uspešan odgovor:** `200 OK` — `UserResponse` sa `active: false`.

**5. Edge-case-ovi:**
- Pokušaj samo-deaktivacije → **409 Conflict** ili **400 Bad Request** (stanje: nedozvoljena operacija nad sopstvenim nalogom).
- ADMIN pokušava deaktivirati OWNER-a ili drugog ADMIN-a → **403 Forbidden**.
- Korisnik ne postoji → **404 Not Found**.

---

# MODUL 2 — CATALOG

## FR-CAT-01 — Kreiranje CatalogItem-a (PRODUCT ili SERVICE)

**1. Rola:** ADMIN, OWNER.

**2. Ulaz:** `POST /api/v1/catalog`
```json
{ "name": "Šišanje", "description": "...", "type": "SERVICE", "price": 1500.00, "durationMinutes": 30 }
```

**3. Backend flow:**
- `@PreAuthorize("hasAnyRole('OWNER','ADMIN')")`.
- Bean Validation: `name` @NotBlank, `price` @NotNull @DecimalMin("0.00" exclusive), `type` @NotNull.
- **Cross-field servisna validacija** (ne može biti čista anotacija):
  - `type == SERVICE` → `durationMinutes` mora biti `!= null` i `> 0` → inače **422 Unprocessable Entity**.
  - `type == PRODUCT` → `durationMinutes` mora biti `null` → ako klijent pošalje vrednost, servis je ili odbacuje uz grešku ili je eksplicitno nulira (preporuka: **422** da se signalizira nekonzistentnost, ne tiho brisanje podatka).
- `INSERT` u `catalog_item`, `active = true` po default-u.

**4. Uspešan odgovor:** `201 Created` — `CatalogItemResponse`.

**5. Edge-case-ovi:**
- `SERVICE` bez `durationMinutes` → **422 Unprocessable Entity**.
- `PRODUCT` sa `durationMinutes` → **422 Unprocessable Entity**.
- Negativna/nula cena → **400 Bad Request** (Bean Validation nivo).
- EMPLOYEE/CUSTOMER pristup → **403 Forbidden**.

---

## FR-CAT-02 — Pretraga/listing kataloga

**1. Rola:** Svi autentifikovani (uključujući CUSTOMER — mora videti katalog da bi napravio rezervaciju/narudžbinu).

**2. Ulaz:** `GET /api/v1/catalog?type=SERVICE&active=true&page=0&size=20`

**3. Backend flow:**
- Nema role restrikcije osim autentifikacije.
- CUSTOMER i EMPLOYEE (read-only za EMPLOYEE) po default-u vide **samo `active=true`** stavke, osim ako eksplicitno ADMIN/OWNER ne zatraže i neaktivne (query parametar `active` se ignoriše/force-uje na `true` za ne-management role).
- Standardna paginacija.

**4. Uspešan odgovor:** `200 OK` — `PageResponse<CatalogItemResponse>`.

**5. Edge-case-ovi:**
- Nema posebnih grešaka van standardnih (401 ako token nedostaje).

---

## FR-CAT-03 — Izmena i deaktivacija CatalogItem-a

**1. Rola:** ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/catalog/{id}` (izmena polja) i `PATCH /api/v1/catalog/{id}/deactivate`

**3. Backend flow:**
- Ista cross-field validacija kao FR-CAT-01 ako se `type`/`durationMinutes` menjaju.
- Deaktivacija **ne** briše postojeće `Reservation`/`OrderItem` zapise koji već referenciraju taj `catalogItemId` (istorijski podaci ostaju netaknuti) — samo sprečava **nove** upotrebe (provera u `ReservationService`/`OrderService` pri kreiranju).

**4. Uspešan odgovor:** `200 OK` — ažuriran `CatalogItemResponse`.

**5. Edge-case-ovi:**
- Item ne postoji → **404 Not Found**.
- Nevalidna cross-field kombinacija → **422**.

---

# MODUL 3 — WORKING HOURS

## FR-WH-01 — Podešavanje radnog vremena po danu

**1. Rola:** ADMIN, OWNER.

**2. Ulaz:** `PUT /api/v1/working-hours/{dayOfWeek}`
```json
{ "openTime": "08:00:00", "closeTime": "20:00:00", "active": true }
```

**3. Backend flow:**
- `@PreAuthorize("hasAnyRole('OWNER','ADMIN')")`.
- Validacija: ako `closeTime < openTime` → **ovo se NE odbija kao greška** — tretira se kao legitimna "smena preko ponoći" (Deo 2 UTC specifikacije). Servis samo interno markira `spansMidnight = true` (izvedeno polje, ne perzistira se nužno ako se računa on-the-fly).
- `UPSERT` semantika: ako zapis za taj `dayOfWeek` već postoji → update; ako ne → insert (jedan zapis po danu, unique constraint na `dayOfWeek`).
- Ovo **ne utiče retroaktivno** na već kreirane `Reservation` zapise — samo na buduće validacije.

**4. Uspešan odgovor:** `200 OK` — `WorkingHoursResponse`.

**5. Edge-case-ovi:**
- `openTime == closeTime` (nulti interval) → **400 Bad Request** ("radno vreme ne sme biti praznog trajanja").
- EMPLOYEE/CUSTOMER pristup → **403 Forbidden**.

---

## FR-WH-02 — Pregled radnog vremena (svi dani)

**1. Rola:** Svi autentifikovani (CUSTOMER treba da vidi radno vreme pre pravljenja rezervacije — može biti i javno dostupno, po odluci tima).

**2. Ulaz:** `GET /api/v1/working-hours`

**3. Backend flow:** Prost read, vraća svih 7 zapisa (uključujući `active=false` dane, da frontend može prikazati "neradno" umesto da ih izostavi).

**4. Uspešan odgovor:** `200 OK` — lista od 7 `WorkingHoursResponse` objekata.

**5. Edge-case-ovi:** Nema posebnih — standardna autentifikaciona provera.

---

## FR-WH-03 — Kreiranje izuzetka od radnog vremena (praznik)

**1. Rola:** ADMIN, OWNER.

**2. Ulaz:** `POST /api/v1/working-hours/exceptions`
```json
{ "date": "2026-12-25", "description": "Božić", "fullDayClosed": true }
```
ili (skraćeno radno vreme):
```json
{ "date": "2026-12-24", "description": "Vidžilja", "fullDayClosed": false, "overrideOpenTime": "08:00:00", "overrideCloseTime": "13:00:00" }
```

**3. Backend flow:**
- Validacija: ako `fullDayClosed == false`, oba `overrideOpenTime` i `overrideCloseTime` moraju biti prisutna (par ide zajedno) → inače **422**.
- `date` mora biti u budućnosti (nema smisla kreirati izuzetak za prošli datum) — **400** ako nije.
- Unique constraint na `date` — ako izuzetak za taj datum već postoji → **409 Conflict** (koristiti `PUT` za izmenu postojećeg umesto `POST` duplikata).
- Invalidacija keša (Deo 4.4 UTC specifikacije) nakon uspešnog upisa.

**4. Uspešan odgovor:** `201 Created` — `WorkingHoursExceptionResponse`.

**5. Edge-case-ovi:**
- Duplirani datum → **409 Conflict**.
- Nekompletan par override vremena → **422 Unprocessable Entity**.
- Prošli datum → **400 Bad Request**.

---

# MODUL 4 — RESERVATIONS

## FR-RES-01 — Kreiranje zahteva za terminom

**1. Rola:** CUSTOMER.

**2. Ulaz:** `POST /api/v1/reservations`
Header: `Idempotency-Key: <client-generated-uuid>`
```json
{ "employeeId": "uuid", "serviceId": "uuid", "startTime": "2026-08-01T18:00:00Z", "note": "..." }
```
(`customerId` se **ne** šalje — uzima se iz JWT-a.)

**3. Backend flow (kompletan redosled iz UTC specifikacije, Deo "Rekapitulacija"):**
- `IdempotencyInterceptor`: proverava `Idempotency-Key` header — ako nedostaje → **400**; ako ključ već postoji sa istim hash-om tela → vraća keširan response bez ponovnog izvršavanja; ako postoji sa **drugačijim** telom → **409/422**.
- `@PreAuthorize("hasRole('CUSTOMER')")`.
- Učitati `CatalogItem` po `serviceId` → mora postojati, `active == true`, `type == SERVICE` → inače **404** (ne postoji) ili **422** (postoji ali nije validna usluga).
- Učitati `User` po `employeeId` → mora postojati, `role == EMPLOYEE`, `active == true` → inače **404**/**422**.
- `endTime = startTime + CatalogItem.durationMinutes`.
- Provera `startTime > Instant.now()` → inače **400** ("termin mora biti u budućnosti").
- Provera `WorkingHoursException` za relevantne datume (Deo 4 UTC spec.) → ako blokirano → **409** ("neradan dan").
- Pronalazak aktivne smene (Kandidat A/B) i provera da `[startTime, endTime)` staje unutar nje → ako ne → **409** ("van radnog vremena").
- **Pesimističko zaključavanje po `employeeId`** (transakciona granica počinje ovde) → provera preklapanja (`findConflicting`, isključujući `CANCELLED`/`REJECTED`) → ako ima konflikta → **409** ("zaposleni je zauzet u tom terminu").
- `INSERT` u `reservation` sa `status = PENDING`.
- Keširanje response-a pod `Idempotency-Key` (u istoj transakciji ili odmah nakon commit-a).

**4. Uspešan odgovor:** `201 Created`
```json
{ "id": "uuid", "status": "PENDING", "startTime": "...", "endTime": "...", "employeeId": "...", "serviceId": "..." }
```

**5. Edge-case-ovi:**
- Nedostaje `Idempotency-Key` → **400**.
- Ponovljen isti key, isto telo → **201/200 sa istim rezultatom** (nije duplirano u bazi).
- Ponovljen isti key, drugačije telo → **409/422**.
- `serviceId` nije SERVICE tip ili je neaktivan → **422**.
- `employeeId` nije validan EMPLOYEE → **422**.
- Termin u prošlosti → **400**.
- Van radnog vremena / neradni dan → **409**.
- Preklapanje sa postojećim terminom → **409**.

---

## FR-RES-02 — Potvrda rezervacije (`PENDING → CONFIRMED`)

**1. Rola:** EMPLOYEE (samo sopstveni termini), ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/reservations/{id}/status` `{ "status": "CONFIRMED" }`

**3. Backend flow:**
- Učitati `Reservation` → **404** ako ne postoji.
- Autorizacija: EMPLOYEE mora imati `entity.employeeId == currentUser.id` → inače **403**.
- Provera tranzicije: trenutni status mora biti `PENDING` → inače **409** ("nevažeća promena statusa").
- **Ponovna** provera preklapanja (moglo se promeniti dok je bio PENDING) → ako konflikt → **409**.
- `UPDATE reservation SET status = CONFIRMED` — Hibernate proverava `@Version` → konkurentna izmena → **409**.

**4. Uspešan odgovor:** `200 OK` — `ReservationResponse` sa `status: CONFIRMED`.

**5. Edge-case-ovi:**
- Status nije `PENDING` (već CONFIRMED/REJECTED/itd.) → **409**.
- Tuđi termin (EMPLOYEE) → **403**.
- Konkurentna izmena (`@Version` mismatch) → **409**.

---

## FR-RES-03 — Odbijanje rezervacije (`PENDING → REJECTED`)

**1. Rola:** EMPLOYEE (sopstveni), ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/reservations/{id}/status` `{ "status": "REJECTED", "note": "Razlog..." }`

**3. Backend flow:** Identično FR-RES-02 osim ciljnog statusa; nema ponovne provere preklapanja (odbijanje ne zahteva proveru zauzetosti).

**4. Uspešan odgovor:** `200 OK` — `status: REJECTED`.

**5. Edge-case-ovi:** Isti kao FR-RES-02.

---

## FR-RES-04 — Otkazivanje rezervacije (`PENDING/CONFIRMED → CANCELLED`)

**1. Rola:** CUSTOMER (samo sopstveni termin), ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/reservations/{id}/status` `{ "status": "CANCELLED" }`

**3. Backend flow:**
- Autorizacija: CUSTOMER mora imati `entity.customerId == currentUser.id` → inače **403**.
- Provera tranzicije: trenutni status mora biti `PENDING` ili `CONFIRMED` → inače **409**.
- **Ako je trenutni status `CONFIRMED` I akter je CUSTOMER:** dodatna provera cutoff prozora — `Instant.now() < startTime.minus(cancellationCutoffMinutes)` → inače **409** ("prekasno za otkazivanje"). ADMIN/OWNER akcija **zaobilazi** ovu proveru.
- `UPDATE reservation SET status = CANCELLED`.

**4. Uspešan odgovor:** `200 OK` — `status: CANCELLED`.

**5. Edge-case-ovi:**
- Tuđi termin (CUSTOMER) → **403**.
- Status već terminalan (REJECTED/CANCELLED/COMPLETED) → **409**.
- CUSTOMER pokušava otkazati unutar cutoff prozora → **409**.

---

## FR-RES-05 — Označavanje termina kao završenog (`CONFIRMED → COMPLETED`)

**1. Rola:** EMPLOYEE (sopstveni), ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/reservations/{id}/status` `{ "status": "COMPLETED" }`

**3. Backend flow:**
- Autorizacija identična FR-RES-02.
- Provera tranzicije: trenutni status mora biti `CONFIRMED` → inače **409**.
- **Obavezna vremenska provera:** `Instant.now() >= entity.endTime` → ako termin (po vremenu) još nije istekao → **409** ("termin još nije istekao").

**4. Uspešan odgovor:** `200 OK` — `status: COMPLETED`.

**5. Edge-case-ovi:**
- Pokušaj pre isteka `endTime` → **409**.
- Status nije `CONFIRMED` → **409**.

---

## FR-RES-06 — Pregled rezervacija (sopstvenih ili svih, sa filterima)

**1. Rola:** CUSTOMER (`GET /reservations/me` — samo svoje), EMPLOYEE/ADMIN/OWNER (`GET /reservations` — sve, sa filterima).

**2. Ulaz:** `GET /api/v1/reservations?status=PENDING&employeeId=uuid&from=2026-08-01&to=2026-08-31&page=0&size=20`

**3. Backend flow:**
- CUSTOMER ruta: `WHERE customerId = currentUser.id` — server-side hardkodovano, ignoriše se bilo koji `customerId` parametar poslat sa fronta.
- EMPLOYEE (ako koristi opšti `/reservations` endpoint umesto `/me`): opciono ograničiti da vidi samo `employeeId == currentUser.id` termine, zavisno od odluke tima (dokument iz Faze State Machine sugeriše da EMPLOYEE radi nad sopstvenim terminima).
- Standardna paginacija i filter kombinacije (svi filteri opcioni, kombinuju se AND logikom).

**4. Uspešan odgovor:** `200 OK` — `PageResponse<ReservationResponse>`.

**5. Edge-case-ovi:** Nevalidan `status` enum vrednost u query parametru → **400**.

---

# MODUL 5 — ORDERS

## FR-ORD-01 — Kreiranje narudžbine (korpa sa proizvodima)

**1. Rola:** CUSTOMER.

**2. Ulaz:** `POST /api/v1/orders`
Header: `Idempotency-Key: <uuid>`
```json
{ "items": [ { "productId": "uuid", "quantity": 2 }, { "productId": "uuid", "quantity": 1 } ] }
```
(Nema `unitPrice` polja — cena se nikad ne prima od klijenta.)

**3. Backend flow:**
- `IdempotencyInterceptor` provera (isto kao FR-RES-01).
- `@PreAuthorize("hasRole('CUSTOMER')")`.
- Bean Validation: `items` @NotEmpty, svaki `quantity` @Positive.
- Transakciona granica: za svaki `productId` — učitati `CatalogItem` → mora postojati, `active == true`, `type == PRODUCT` → inače **422** (jedna nevalidna stavka odbija **ceo** zahtev, ne pravi se delimična narudžbina).
- Za svaku stavku: `unitPrice = catalogItem.price` (snapshot), `lineTotal = unitPrice * quantity`.
- `totalPrice = SUM(lineTotal svih stavki)`.
- `INSERT` u `order` (`status = CREATED`, `customerId` iz JWT-a, `handledBy = null`) i `INSERT` u `order_item` za svaku stavku — sve u **jednoj transakciji** (cascade preko `Order` agregatnog korena).

**4. Uspešan odgovor:** `201 Created`
```json
{ "id": "uuid", "status": "CREATED", "totalPrice": 4500.00, "items": [ { "productId": "...", "quantity": 2, "unitPrice": 1500.00, "lineTotal": 3000.00 }, ... ] }
```

**5. Edge-case-ovi:**
- Prazna `items` lista → **400**.
- `productId` referencira `SERVICE` tip (ne `PRODUCT`) → **422** ("samo proizvodi mogu ići u narudžbinu" — sekcija 6).
- Neaktivan proizvod → **422**.
- Nepostojeći `productId` → **404**.
- Nedostaje `Idempotency-Key` → **400**.
- Isti key, drugačije telo → **409/422**.

---

## FR-ORD-02 — Preuzimanje narudžbine u obradu (`CREATED → IN_PROGRESS`)

**1. Rola:** EMPLOYEE, ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/orders/{id}/status` `{ "status": "IN_PROGRESS" }`

**3. Backend flow:**
- Učitati `Order` → **404** ako ne postoji.
- Provera tranzicije: trenutni status mora biti `CREATED` → inače **409**.
- `entity.handledBy = currentUser.id` (atomarno sa promenom statusa, ista transakcija).
- `save()` → Hibernate `@Version` provera — ako je **drugi** zaposleni u međuvremenu već preuzeo (i time promenio `version`) → **409 Conflict** ("narudžbina je već preuzeta") — ovo je klasičan slučaj gde optimistic lock direktno implementira poslovno pravilo "samo jedan zaposleni može preuzeti".

**4. Uspešan odgovor:** `200 OK` — `status: IN_PROGRESS`, `handledBy: <currentUser.id>`.

**5. Edge-case-ovi:**
- Status nije `CREATED` → **409**.
- Konkurentno preuzimanje od strane dva zaposlena → drugi request dobija **409**.

---

## FR-ORD-03 — Označavanje narudžbine kao spremne (`IN_PROGRESS → READY`)

**1. Rola:** EMPLOYEE (samo `handledBy == currentUser.id`), ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/orders/{id}/status` `{ "status": "READY" }`

**3. Backend flow:**
- Autorizacija: EMPLOYEE mora biti `entity.handledBy == currentUser.id` → inače **403** ("narudžbinu obrađuje drugi zaposleni").
- Provera tranzicije: trenutni status mora biti `IN_PROGRESS` → inače **409**.

**4. Uspešan odgovor:** `200 OK` — `status: READY`.

**5. Edge-case-ovi:** Isti obrazac kao gore (403 za tuđu narudžbinu, 409 za nevalidnu tranziciju).

---

## FR-ORD-04 — Označavanje narudžbine kao preuzete (`READY → COMPLETED`)

**1. Rola:** EMPLOYEE (`handledBy`), ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/orders/{id}/status` `{ "status": "COMPLETED" }`

**3. Backend flow:** Identično FR-ORD-03 (autorizacija + tranzicija), bez dodatnih vremenskih provera (COMPLETED ovde znači fizičko preuzimanje na licu mesta, ne vremensko istek kao kod rezervacija).

**4. Uspešan odgovor:** `200 OK` — `status: COMPLETED`.

**5. Edge-case-ovi:** Trenutni status nije `READY` → **409**.

---

## FR-ORD-05 — Otkazivanje narudžbine (`CREATED/IN_PROGRESS/READY → CANCELLED`)

**1. Rola:** zavisi od trenutnog statusa (vidi State Machine spec, Deo 2.3):
- `CREATED` → CUSTOMER (sopstvena), EMPLOYEE, ADMIN, OWNER.
- `IN_PROGRESS` → EMPLOYEE (samo `handledBy`), ADMIN, OWNER — **ne** CUSTOMER.
- `READY` → **samo** ADMIN, OWNER.

**2. Ulaz:** `PATCH /api/v1/orders/{id}/status` `{ "status": "CANCELLED" }`

**3. Backend flow:**
- Servis prvo utvrđuje trenutni status entiteta, zatim primenjuje odgovarajuću autorizacionu granu iz tabele iznad (implementirano kao `switch(entity.status)` sa različitim `assertAuthorized()` pozivima po grani).
- CUSTOMER autorizacija: `entity.customerId == currentUser.id` **I** `entity.status == CREATED` — ako je status bilo šta drugo, CUSTOMER dobija **403** (ne 409 — jer sa CUSTOMER stanovišta, on **nikad** nema pravo da otkaže IN_PROGRESS/READY narudžbinu, to nije stanje-zavisna nego rola-zavisna zabrana).

**4. Uspešan odgovor:** `200 OK` — `status: CANCELLED`.

**5. Edge-case-ovi:**
- CUSTOMER pokušava otkazati `IN_PROGRESS`/`READY` narudžbinu → **403 Forbidden**.
- EMPLOYEE koji nije `handledBy` pokušava otkazati `IN_PROGRESS` → **403**.
- EMPLOYEE pokušava otkazati `READY` narudžbinu (rezervisano za ADMIN/OWNER) → **403**.
- Narudžbina već u terminalnom stanju (`COMPLETED`/`CANCELLED`) → **409**.

---

## FR-ORD-06 — Pregled narudžbina (sopstvenih ili svih, sa filterima)

**1. Rola:** CUSTOMER (`GET /orders/me`), EMPLOYEE/ADMIN/OWNER (`GET /orders`, sa filterima po `status`, `handledBy`, opseg datuma).

**2-5.** Analogno FR-RES-06 — server-side hardkodovan `customerId` filter za CUSTOMER rutu, standardna paginacija, `400` za nevalidan enum u query parametru.

---

# MODUL 6 — DASHBOARD

## FR-DASH-01 — Sažetak za OWNER/ADMIN (puni obim)

**1. Rola:** OWNER, ADMIN.

**2. Ulaz:** `GET /api/v1/dashboard/summary?from=2026-07-01&to=2026-07-31`

**3. Backend flow:**
- `@PreAuthorize("hasAnyRole('OWNER','ADMIN')")`.
- Agregatni JPQL/native upiti (sekcija 19 — izbeći N+1, koristiti `GROUP BY`/`SUM`/`COUNT` direktno u bazi, ne povlačiti entitete pa sabirati u Java kodu):
  - `SELECT COUNT(*), SUM(totalPrice) FROM order WHERE createdAt BETWEEN :from AND :to AND status = COMPLETED`
  - `SELECT status, COUNT(*) FROM reservation WHERE startTime BETWEEN :from AND :to GROUP BY status`
- Rezultati se mapiraju direktno u projekcioni DTO (`DashboardSummaryResponse`), bez učitavanja punih entiteta.

**4. Uspešan odgovor:** `200 OK`
```json
{ "totalRevenueCompleted": 125000.00, "completedOrdersCount": 84, "reservationsByStatus": { "PENDING": 5, "CONFIRMED": 12, "COMPLETED": 40, "CANCELLED": 3, "REJECTED": 1 } }
```

**5. Edge-case-ovi:**
- `from > to` → **400 Bad Request**.
- EMPLOYEE/CUSTOMER pristup → **403 Forbidden**.
- Prazan opseg (nema podataka) → **200 OK** sa nula-vrednostima, ne greška.

---

## FR-DASH-02 — Operativni pregled za EMPLOYEE (današnji obim)

**1. Rola:** EMPLOYEE (i implicitno OWNER/ADMIN mogu pristupiti istoj skraćenoj verziji ako žele brz pregled, ali imaju i FR-DASH-01 za pun uvid).

**2. Ulaz:** `GET /api/v1/dashboard/today`

**3. Backend flow:**
- Agregira **samo** rezervacije i narudžbine vezane za `currentUser.id` (kao `employeeId`/`handledBy`) i **samo** za tekući kalendarski dan u poslovnoj zoni (`Europe/Belgrade`), ne UTC dan (bitno oko ponoći — koristi se ista `businessZoneId` logika kao u UTC/WorkingHours specifikaciji za granice "danas od 00:00 do 23:59:59 lokalno").
- Upit: broj `PENDING` rezervacija koje čekaju njegovu potvrdu, broj `CONFIRMED` termina danas, broj `CREATED` narudžbina koje čekaju preuzimanje (sistemski, ne filtrirano po `handledBy` jer još nisu preuzete), broj `IN_PROGRESS` koje on trenutno obrađuje.

**4. Uspešan odgovor:** `200 OK`
```json
{ "pendingReservationsToMe": 3, "confirmedTodayCount": 7, "unclaimedOrdersCount": 5, "myInProgressOrdersCount": 2 }
```

**5. Edge-case-ovi:**
- CUSTOMER pristup → **403 Forbidden**.
- Nema posebnih vremenskih edge-case-ova osim ispravnog izračuna granica "danas" u lokalnoj zoni (ponoć kao granica, ne UTC ponoć).

---

## Rekapitulacija — HTTP status kodovi kroz ceo sistem (jedinstvena konvencija)

| Status | Kada se koristi |
|---|---|
| `200 OK` | Uspešan GET ili uspešna promena stanja postojećeg resursa (PATCH). |
| `201 Created` | Uspešno kreiranje novog resursa (POST). |
| `400 Bad Request` | Strukturno nevalidan zahtev — nedostaje obavezno polje, pogrešan tip, nedostaje header, nevalidan enum u query parametru, datum u prošlosti gde se zahteva budućnost. |
| `401 Unauthorized` | Nedostaje/nevalidan/istekao JWT, ili je korisnik deaktiviran, ili su kredencijali pri loginu netačni. |
| `403 Forbidden` | Autentifikovan korisnik, ali rola ili vlasništvo nad resursom ne dozvoljava traženu akciju. |
| `404 Not Found` | Referencirani resurs (po ID-u) ne postoji. |
| `409 Conflict` | Zahtev je strukturno ispravan, ali trenutno stanje resursa ga sprečava — nevalidna state-machine tranzicija, preklapanje termina, već zauzeta narudžbina, konkurentna izmena (`@Version` mismatch), duplirani email pri registraciji, cutoff prozor za otkazivanje. |
| `422 Unprocessable Entity` | Zahtev je strukturno ispravan i prošao je Bean Validation, ali krši **cross-field poslovno pravilo** (SERVICE bez trajanja, PRODUCT sa trajanjem, SERVICE stavka u Order-u, nekompletan par override radnog vremena). |
| `429 Too Many Requests` | Prekoračen rate limit (login, registracija). |
| `500 Internal Server Error` | Neočekivana greška — nikad namerno vraćeno od strane servisne logike, samo fallback u `GlobalExceptionHandler`. |

**Napomena o razlici 409 vs 422** (često zbunjujuća granica, vredna eksplicitnog pravila za tim): **409** se koristi kada je problem u **vremenskoj/stanju sistema** dimenziji (nešto se promenilo ili je već u određenom stanju). **422** se koristi kada je problem **strukturalno-semantički** unutar samog zahteva (podaci su interno nekonzistentni, npr. tip stavke ne odgovara pravilu modula) — nezavisno od bilo kakvog "trenutnog stanja baze".
