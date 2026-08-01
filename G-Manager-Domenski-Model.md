# G-Manager — Specifikacija Domenskog Modela

**Kontekst:** Faza 0 (infrastruktura) i `common` modul (BaseEntity) su završeni.
**Baza:** MySQL, Hibernate `ddl-auto: update` (lokalni dev).
**Nasleđeno iz `BaseEntity` (izostavljeno iz tabela ispod):** `id: UUID`, `createdAt: Instant`, `updatedAt: Instant`, `version: Long (@Version)`.

**Konvencija izolacije modula:** Kad entitet jednog modula treba da referencira entitet drugog modula, **nikad se ne koristi `@ManyToOne`/JPA relacija preko paketa** — koristi se čist `UUID` strani ključ (npr. `customerId`, `employeeId`, `productId`). Puni objekat se po potrebi dohvata pozivom **javnog servisa** tog modula (`UserService.getById(uuid)`, `CatalogService.getById(uuid)`), nikad direktnim JPA join-om. Ovo je jedino mesto gde JPA `@ManyToOne`/`@OneToMany` ostaje dozvoljeno: **unutar istog modula** (npr. `Order` ↔ `OrderItem`).

---

## 1. User

**Modul:** `user`
**Uloga:** Predstavlja svakog aktera u sistemu (OWNER, ADMIN, EMPLOYEE, CUSTOMER). Jedini izvor identiteta i autorizacionih podataka.

| Atribut | Java tip | Validacija (DTO sloj) | Opis / Biznis pravilo |
|---|---|---|---|
| `name` | `String` | `@NotBlank`, `@Size(max = 120)` | Prikazno ime korisnika. |
| `email` | `String` | `@NotBlank`, `@Email`, `@Size(max = 180)` | Jedinstven (`unique` DB constraint + `@UniqueElements`/servisna provera). Koristi se kao login identifikator. |
| `passwordHash` | `String` | — (nikad u DTO-u) | BCrypt hash; **nikad ne izlazi u response DTO ni u log** (sekcija 16, 20). |
| `role` | `Role` (enum: `OWNER, ADMIN, EMPLOYEE, CUSTOMER`) | `@NotNull` | Rola se **ne prima kroz update od strane samog korisnika**; menja je samo OWNER/ADMIN kroz dedikovan endpoint. Nikad se ne čita iz JWT-a za autorizaciju — uvek iz baze. |
| `active` | `boolean` (primitive, default `true`) | — | Soft-delete flag (sekcija 25). `false` → korisnik ne može da se autentifikuje čak i sa validnim JWT-om (provera u filteru). |

**Relacije:** Nema JPA relacija ka drugim entitetima. Svi drugi moduli referenciraju `User` isključivo preko `UUID` (`customerId`, `employeeId`, `handledBy`).

**Napomena o hijerarhiji rola:** Nije modelovano kao JPA relacija — to je čisto servisno pravilo u `UserService` (ADMIN ne sme kreirati/menjati OWNER ili drugog ADMIN-a).

---

## 2. CatalogItem

**Modul:** `catalog`
**Uloga:** Predstavlja proizvod ili uslugu koju biznis nudi; referentna tačka za Order (PRODUCT) i Reservation (SERVICE).

| Atribut | Java tip | Validacija (DTO sloj) | Opis / Biznis pravilo |
|---|---|---|---|
| `name` | `String` | `@NotBlank`, `@Size(max = 150)` | Naziv proizvoda/usluge. |
| `description` | `String` | `@Size(max = 2000)` | Opcioni detaljan opis. Mapirati na `@Lob`/`TEXT` kolonu ako prelazi standardnu dužinu. |
| `type` | `ItemType` (enum: `PRODUCT, SERVICE`) | `@NotNull` | Determiniše da li item ide u `Order` ili `Reservation` (sekcija 6, Catalog pravila). |
| `price` | `BigDecimal` | `@NotNull`, `@DecimalMin(value = "0.00", inclusive = false)`, `@Digits(integer = 10, fraction = 2)` | Mapirati kao `@Column(precision = 12, scale = 2)`. Nikad `double`/`float`. |
| `durationMinutes` | `Integer` (wrapper, nullable) | `@Positive` kad je prisutan (validacija na nivou servisa, uslovna) | **Obavezan** ako `type == SERVICE`; **mora biti `null`** ako `type == PRODUCT`. Ovo je servisna (cross-field) validacija — ne može se izraziti čistom Bean Validation anotacijom na DTO-u, već u `CatalogService.validate()`. |
| `active` | `boolean` (default `true`) | — | `false` → item se ne može dodati ni u novi `Order` ni u novu `Reservation` (provera u `OrderService`/`ReservationService` preko `CatalogService.getActiveById()`). |

**Relacije:** Nema JPA relacija. `Order`/`OrderItem` i `Reservation` referenciraju ga isključivo kao `productId`/`serviceId: UUID`.

---

## 3. Reservation

**Modul:** `reservation`
**Uloga:** Zakazani termin korisnika (CUSTOMER) kod zaposlenog (EMPLOYEE) za konkretnu uslugu (SERVICE) iz kataloga.

| Atribut | Java tip | Validacija (DTO sloj) | Opis / Biznis pravilo |
|---|---|---|---|
| `customerId` | `UUID` | `@NotNull` | Referenca ka `User` (rola CUSTOMER). Cross-modul → samo UUID. Popunjava se iz `SecurityContext`-a (trenutni ulogovani korisnik), ne iz request tela, radi sprečavanja da neko pravi rezervaciju u ime drugog korisnika. |
| `employeeId` | `UUID` | `@NotNull` | Referenca ka `User` (rola EMPLOYEE). Validirati u servisu da referencirani `User` zaista ima rolu `EMPLOYEE` i da je `active`. |
| `serviceId` | `UUID` | `@NotNull` | Referenca ka `CatalogItem`. Servisna validacija: mora postojati, `active == true`, `type == SERVICE`. |
| `startTime` | `Instant` | `@NotNull`, servisna provera `@Future`-ekvivalent (custom, jer `@Future` radi nad `Instant` ali granularnost/timezone logika je poslovna) | UTC. Mora biti u budućnosti u odnosu na `Instant.now()`. |
| `endTime` | `Instant` | izračunava se na backendu (`startTime + CatalogItem.durationMinutes`), **ne prima se od klijenta** | UTC. Klijent šalje samo `startTime`; `endTime` se derivira iz trajanja usluge da bi se sprečila neusklađenost. |
| `status` | `ReservationStatus` (enum: `PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED`) | `@NotNull` | Default `PENDING` pri kreiranju. Promenu statusa vrši EMPLOYEE/ADMIN/OWNER kroz dedikovan endpoint (ne generički update). |
| `note` | `String` | `@Size(max = 500)` | Opciona napomena korisnika. |

**Relacije:** Nema JPA `@ManyToOne` ka `User` ili `CatalogItem` (cross-modul izolacija). Sve tri reference (`customerId`, `employeeId`, `serviceId`) su goli `UUID` sa DB indeksom (bez FK constraint-a ako se strogo poštuje modularna nezavisnost, ili "soft FK" — po izboru tima; preporuka: indeks bez FK radi lakše modularizacije u budućnosti).

**Kritično pravilo bez preklapanja (sekcija 6):** implementira se kao custom repository upit:
`findConflicting(employeeId, startTime, endTime, excludeStatuses = [CANCELLED, REJECTED])` — proverava da li postoji bilo koja rezervacija istog zaposlenog čiji se opseg `[startTime, endTime)` preklapa sa novim opsegom.

---

## 4. WorkingHours

**Modul:** `reservation`
**Uloga:** Definiše radno vreme biznisa po danu u nedelji; koristi se za validaciju da li je termin rezervacije dozvoljen.

| Atribut | Java tip | Validacija (DTO sloj) | Opis / Biznis pravilo |
|---|---|---|---|
| `dayOfWeek` | `DayOfWeek` (java.time enum) | `@NotNull` | Jedan zapis po danu (unique constraint na `dayOfWeek`). |
| `openTime` | `LocalTime` | `@NotNull` | **Lokalno vreme biznisa** (npr. `Europe/Belgrade`), ne UTC — radno vreme ima smisla samo u lokalnom kontekstu. |
| `closeTime` | `LocalTime` | `@NotNull`, servisna provera `closeTime > openTime` | Isto, lokalno vreme. |
| `active` | `boolean` (default `true`) | — | `false` → taj dan se tretira kao neradni bez obzira na `openTime`/`closeTime` vrednosti. |

**Relacije:** Samostalan entitet, nema referenci ka drugim modulima. `ReservationService` ga koristi kao read-only referencu (isti modul, dozvoljen direktan repository pristup).

**Napomena:** Ovaj entitet **ne nasleđuje `BaseEntity`** u punom smislu ako se posmatra kao "konfiguracioni" red (nema potrebe za `@Version` optimističkim zaključavanjem po danu), ali radi konzistentnosti arhitekture preporuka je da ipak nasledi `BaseEntity` — jednoobraznost sloja je vrednija od uštede par kolona.

---

## 5. Order

**Modul:** `order`
**Uloga:** Predstavlja narudžbinu proizvoda (pickup) koju je napravio CUSTOMER; agregatni koren za `OrderItem`.

| Atribut | Java tip | Validacija (DTO sloj) | Opis / Biznis pravilo |
|---|---|---|---|
| `customerId` | `UUID` | `@NotNull` | Referenca ka `User`. Popunjava se iz `SecurityContext`-a, ne iz tela zahteva. |
| `handledBy` | `UUID` (nullable) | — | Referenca ka `User` (EMPLOYEE koji je preuzeo obradu). `null` dok niko ne preuzme narudžbinu; popunjava se pri prelasku u `IN_PROGRESS`. |
| `status` | `OrderStatus` (enum: `CREATED, IN_PROGRESS, READY, COMPLETED, CANCELLED`) | `@NotNull` | Default `CREATED`. Statusna mašina se validira u servisu (npr. ne može direktno iz `CREATED` u `COMPLETED`). |
| `totalPrice` | `BigDecimal` | izračunava se na backendu, **ne prima se od klijenta** | `@Column(precision = 12, scale = 2)`. Jednako sumi `lineTotal` svih pripadajućih `OrderItem` zapisa. |
| `items` | `List<OrderItem>` | `@NotEmpty` (na `CreateOrderRequest.items`, ne na entitetu) | Vidi relacije ispod. |

**Relacije (unutar istog modula — JPA dozvoljeno):**
```java
@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
private List<OrderItem> items = new ArrayList<>();
```
- `Order` je agregatni koren; `OrderItem` se ne kreira niti perzistira nezavisno od `Order`-a (uvek kroz `Order.addItem(...)` metodu na entitetu ili kroz servis).

---

## 6. OrderItem

**Modul:** `order`
**Uloga:** Pojedinačna stavka unutar narudžbine — snapshot cene proizvoda u trenutku kupovine.

| Atribut | Java tip | Validacija (DTO sloj) | Opis / Biznis pravilo |
|---|---|---|---|
| `order` | `Order` (`@ManyToOne`) | — | JPA relacija — dozvoljeno jer je isti modul. Mapirano preko `order_id` kolone. |
| `productId` | `UUID` | `@NotNull` | Referenca ka `CatalogItem` iz `catalog` modula — **cross-modul, samo UUID**. Servis mora proveriti `active == true` i `type == PRODUCT` pre kreiranja stavke. |
| `quantity` | `Integer` | `@NotNull`, `@Positive`, `@Max(999)` (razumna gornja granica) | Klijent šalje **samo** `productId` i `quantity`. |
| `unitPrice` | `BigDecimal` | izračunava se na backendu (snapshot iz `CatalogItem.price` u trenutku kreiranja), **ne prima se od klijenta** | `@Column(precision = 12, scale = 2)`. Snapshot je namerno — ako se cena proizvoda kasnije promeni u katalogu, već kreirane narudžbine zadržavaju istorijsku cenu. |
| `lineTotal` | `BigDecimal` | izračunava se na backendu (`unitPrice * quantity`) | `@Column(precision = 12, scale = 2)`. |

**Relacije:** `@ManyToOne` ka `Order` (isti modul — dozvoljeno). `productId` ka `CatalogItem` je čist `UUID` (cross-modul — zabranjena direktna JPA relacija).

**Napomena o BaseEntity:** `OrderItem` je child entitet u agregatu; može nasleđivati `BaseEntity` radi konzistentnosti (dobija sopstveni `id`, `createdAt` itd.), ali `@Version` na child entitetu obično nije potreban — optimistička kontrola se radi na nivou `Order` (agregatnog korena). Ako `ddl-auto: update` i JPA cascade already personality zahtevaju `version` kolonu i na child entitetu, ostaviti je (bezopasno), ali oslanjati se na `Order.version` za detekciju konflikta.

---

## 7. IdempotencyKey

**Modul:** `idempotency` (deljena tehnička infrastruktura, ne poslovni modul)
**Uloga:** Sprečava duplirano izvršavanje kritičnih `POST` operacija (order create, reservation create, payment — sekcija 13) pri retry-jevima klijenta.

| Atribut | Java tip | Validacija (DTO sloj) | Opis / Biznis pravilo |
|---|---|---|---|
| `key` | `String` | `@NotBlank`, `@Size(max = 255)` | Vrednost iz `Idempotency-Key` HTTP header-a. Unique constraint u kombinaciji sa `endpoint` (isti key sme da se ponovi na različitim endpointima bez konflikta). |
| `endpoint` | `String` | `@NotBlank` | Npr. `"POST /api/v1/orders"` — razdvaja namespace ključeva po ruti. |
| `requestHash` | `String` | `@NotBlank` | SHA-256 hash tela zahteva. Ako isti `key` stigne sa **drugačijim** hash-om → 409/422 (konflikt idempotency ugovora — klijent zloupotrebljava isti ključ za drugačiji zahtev). |
| `responseStatus` | `Integer` | `@NotNull` | HTTP status originalnog response-a (npr. 201), da bi se identičan status vratio pri replay-u. |
| `responseBody` | `String` (`@Lob`/`TEXT`) | — | Serijalizovan (JSON) originalni response. Vraća se **bez ponovnog izvršavanja servisne logike** kad se isti `key` + isti `requestHash` ponove. |
| `expiresAt` | `Instant` | `@NotNull` | UTC. TTL zapisa (npr. `createdAt + 24h`) — nakon isteka, isti `key` se tretira kao nov (sprečava neograničen rast tabele; potreban scheduled cleanup job). |

**Relacije:** Nema veze ni sa jednim domenskim modulom — čisto tehnički presek (implementira se kao interceptor/aspect koji se okidа pre ulaska u `OrderService`/`ReservationService`). Ne referencira `User` niti bilo koji entitet — potpuno je nezavisan.

---

## Rekapitulacija: Cross-modul reference (samo UUID, bez JPA relacije)

| Iz entiteta | Ka entitetu (drugi modul) | Polje |
|---|---|---|
| `Reservation` | `User` (CUSTOMER) | `customerId: UUID` |
| `Reservation` | `User` (EMPLOYEE) | `employeeId: UUID` |
| `Reservation` | `CatalogItem` (SERVICE) | `serviceId: UUID` |
| `Order` | `User` (CUSTOMER) | `customerId: UUID` |
| `Order` | `User` (EMPLOYEE) | `handledBy: UUID` |
| `OrderItem` | `CatalogItem` (PRODUCT) | `productId: UUID` |

## Rekapitulacija: Dozvoljene JPA relacije (isti modul)

| Entitet | Relacija | Ka entitetu |
|---|---|---|
| `Order` | `@OneToMany(mappedBy="order", cascade=ALL, orphanRemoval=true)` | `OrderItem` |
| `OrderItem` | `@ManyToOne` | `Order` |

---

### Sledeći logičan korak
Definisanje Flyway migracija (`V1__init_schema.sql`) sa tačnim `precision/scale` za `BigDecimal` kolone, unique/indeks constraint-ima (`users.email`, `idempotency_key.key + endpoint`, `working_hours.day_of_week`), i odluka o FK strategiji za cross-modul UUID kolone (soft-FK bez `REFERENCES` vs. striktan FK) — preporuka je **bez FK-a** radi doslednog poštovanja modularne nezavisnosti iz sekcije 3/6/29, uz aplikativnu validaciju u servisima kao jedini garant integriteta.
