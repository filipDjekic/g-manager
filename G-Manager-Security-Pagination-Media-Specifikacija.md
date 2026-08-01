# G-Manager — Security Matrix, Paginacija & Media Storage

**Kontekst:** Poslednja tri tehnička detalja pre implementacije. Kratko i precizno, direktan ulaz za `SecurityConfig`, `common/pagination` i budući `media`/`storage` paket.

---

## 1. Security Matrix & JWT Refresh Strategija

### 1.1 Tabela ruta

**Pravilo koje treba imati na umu:** `antMatchers`/`SecurityFilterChain` može izraziti samo **grubu** (URL + HTTP metod + rola) granicu. Sve gde autorizacija zavisi od **vlasništva nad resursom** ili **trenutnog statusa entiteta** (npr. `PATCH /reservations/{id}/status`) se **ne** može izraziti na ovom nivou — tu `SecurityConfig` garantuje samo "autentifikovan korisnik", a fina provera (vlasništvo, ciljni status) ide isključivo u servisni sloj, kako je već definisano u Funkcionalnoj i State Machine specifikaciji.

| Ruta | Metod | Dozvola |
|---|---|---|
| `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/refresh` | POST | **PUBLIC** |
| `/actuator/health` | GET | **PUBLIC** |
| `/api/v1/users/me` | GET, PATCH | **AUTHENTICATED** (bilo koja rola, samo sopstveni nalog — provera u servisu) |
| `/api/v1/users`, `/api/v1/users/{id}/deactivate` | POST, GET, PATCH | `OWNER`, `ADMIN` |
| `/api/v1/catalog` | GET | **AUTHENTICATED** |
| `/api/v1/catalog`, `/api/v1/catalog/{id}`, `/api/v1/catalog/{id}/deactivate` | POST, PATCH | `OWNER`, `ADMIN` |
| `/api/v1/working-hours` | GET | **AUTHENTICATED** |
| `/api/v1/working-hours/{day}`, `/api/v1/working-hours/exceptions` | PUT, POST | `OWNER`, `ADMIN` |
| `/api/v1/reservations`, `/api/v1/reservations/me` | POST, GET | **AUTHENTICATED** (grubo — `POST` dalje suženo na `CUSTOMER` u servisu) |
| `/api/v1/reservations/{id}/status` | PATCH | **AUTHENTICATED** (fina provera u servisu — vidi State Machine spec.) |
| `/api/v1/orders`, `/api/v1/orders/me` | POST, GET | **AUTHENTICATED** (`POST` suženo na `CUSTOMER` u servisu) |
| `/api/v1/orders/{id}/status` | PATCH | **AUTHENTICATED** (fina provera u servisu) |
| `/api/v1/dashboard/summary` | GET | `OWNER`, `ADMIN` |
| `/api/v1/dashboard/today` | GET | `EMPLOYEE`, `ADMIN`, `OWNER` |

Sve ostalo (nedefinisano) → `denyAll()` po default-u (`SecurityFilterChain` fail-closed, ne fail-open).

### 1.2 Refresh Token strategija

**Access Token (JWT):**
- Kratkog veka: **15 minuta**. Stateless, potpisan (HS256 ili RS256), nosi samo `sub=userId` i `exp`. **Ne čuva se u bazi** — validnost se proverava isključivo potpisom i istekom.
- Vraća se klijentu u JSON telu (`AuthResponse.token`), čuva se u memoriji frontend aplikacije (React state/context), **ne** u `localStorage` (smanjuje XSS izloženost).

**Refresh Token:**
- Dugog veka: **14 dana**. Neprovidan, kriptografski nasumičan string (ne mora biti JWT).
- **Čuva se u bazi** u tabeli `refresh_token`: `id, userId, tokenHash (SHA-256, nikad plaintext), expiresAt, revoked (boolean), replacedByTokenId (nullable), createdAt`. Isti princip kao i lozinke — ako baza procuri, tokeni sami po sebi nisu upotrebljivi.
- Isporučuje se kao **`HttpOnly, Secure, SameSite=Strict`** kolačić — nedostupan JavaScript-u na frontend-u, čime se dodatno smanjuje XSS rizik krađe tokena.

**Rotacija (Refresh Token Rotation):**
- Svaki poziv `POST /api/v1/auth/refresh` **odmah** invalidira (`revoked = true`) stari refresh token i izdaje nov, povezan preko `replacedByTokenId` (lanac rotacije).
- **Detekcija krađe:** ako se **već iskorišćen/opozvan** refresh token ponovo pojavi u zahtevu → tretira se kao signal kompromitacije → **ceo lanac** tokena za tog korisnika (sva deca u rotacionom lancu) se opoziva, korisnik mora ponovo da se uloguje na svim uređajima.
- **Logout:** `DELETE`/`revoked = true` na refresh token zapisu. Access token i dalje ostaje tehnički validan do isteka (15 min) jer je stateless — ovo je prihvaćen kompromis; kratak access token TTL ograničava prozor izloženosti.

---

## 2. Dynamic Filtering & Pagination Standard

### 2.1 Globalna Pageable konfiguracija

```java
@Bean
public PageableHandlerMethodArgumentResolverCustomizer pageableCustomizer() {
    return resolver -> {
        resolver.setMaxPageSize(100);
        resolver.setFallbackPageable(PageRequest.of(0, 20, Sort.by("createdAt").descending()));
    };
}
```
- Default: `page=0, size=20`, sortirano po `createdAt DESC` (najnoviji prvi).
- `size` preko 100 se **tiho skraćuje** na 100 (`setMaxPageSize`), ne baca grešku — konzistentno sa ranije definisanim ponašanjem.
- **Whitelist sortable polja po modulu** (obavezno, sprečava proizvoljan/nevalidan JPQL `sort` string) — servis mapira dozvoljene `sort` vrednosti (npr. `"name"`, `"price"`, `"createdAt"`) na stvarna entity polja; nepoznata vrednost → `400 Bad Request`.

### 2.2 Spring Data JPA Specification — standard za opcione filtere

**Obrazac:** Za svaki modul sa filterima (Catalog, Reservation, Order, User), repository nasleđuje i `JpaSpecificationExecutor<T>`, a filteri se grade kao kompozicija malih, nezavisnih `Specification<T>` objekata — svaki vraća `null` predikat ako odgovarajuće filter polje nije poslato (Spring Data ignoriše `null` predikate pri kombinovanju, pa filter jednostavno izostaje iz `WHERE` klauzule).

```java
public class CatalogSpecifications {

    public static Specification<CatalogItem> hasType(ItemType type) {
        return (root, query, cb) -> type == null ? null : cb.equal(root.get("type"), type);
    }

    public static Specification<CatalogItem> priceBetween(BigDecimal min, BigDecimal max) {
        return (root, query, cb) -> {
            if (min == null && max == null) return null;
            if (min != null && max != null) return cb.between(root.get("price"), min, max);
            return min != null
                ? cb.greaterThanOrEqualTo(root.get("price"), min)
                : cb.lessThanOrEqualTo(root.get("price"), max);
        };
    }

    public static Specification<CatalogItem> nameContains(String search) {
        return (root, query, cb) -> (search == null || search.isBlank())
            ? null
            : cb.like(cb.lower(root.get("name")), "%" + search.toLowerCase() + "%");
    }
}
```

**Kompozicija u servisu (iz `CatalogFilterRequest` DTO-a: `type, minPrice, maxPrice, search, active`):**
```java
Specification<CatalogItem> spec = Specification
    .where(CatalogSpecifications.hasType(filter.type()))
    .and(CatalogSpecifications.priceBetween(filter.minPrice(), filter.maxPrice()))
    .and(CatalogSpecifications.nameContains(filter.search()));

Page<CatalogItem> result = catalogRepository.findAll(spec, pageable);
```

**Zašto ovaj obrazac, a ne ručno pisanje `@Query` po kombinaciji filtera:** Broj mogućih kombinacija opcionih filtera raste eksponencijalno (2^n JPQL varijanti za n filtera) ako se pokušava pokriti svaka kombinacija ručno. `Specification` kompozicija svodi to na **linearan** broj malih, nezavisno testabilnih predikat-fabrika, koje se slobodno kombinuju bez eksplozije koda. Isti obrazac se ponavlja identično za `ReservationSpecifications` (`employeeId, status, dateRange`) i `OrderSpecifications` (`status, handledBy, dateRange`).

---

## 3. Media Storage Strategija (slike — katalog, profil)

**Osnovno pravilo:** Baza **nikad** ne čuva binarni sadržaj slike (nema `BLOB` kolona) — čuva se isključivo `String` URL/putanja (`catalog_item.image_url`, `user.avatar_url`, oba nullable).

### 3.1 Arhitektura skladištenja

- Fajlovi se čuvaju **van aplikacije i van baze** — apstrahovano kroz `FileStorageService` interfejs sa dve implementacije, birane preko Spring profila:
  - `LocalFileStorageService` (lokalni dev) — čuva na disk (`/data/uploads`), servira preko statičkog resursnog handler-a.
  - `S3FileStorageService` (produkcija) — MinIO (self-hosted) ili AWS S3, isti interfejs.
- Ovo drži `CatalogService`/`UserService` potpuno neupućene u **gde** fajl fizički živi — samo pozivaju `fileStorageService.store(file)` i dobijaju URL nazad.

### 3.2 Upload flow

`POST /api/v1/catalog/{id}/image` (`multipart/form-data`):
1. `@PreAuthorize` — `OWNER`/`ADMIN` za katalog; `/users/me/avatar` dostupno svakom autentifikovanom za sopstveni profil.
2. Validacija **pre** čuvanja: whitelist `Content-Type` (`image/jpeg`, `image/png`), max veličina (npr. 5 MB), i provera **stvarnog** sadržaja fajla (magic bytes/signature), ne samo ekstenzije ili deklarisanog MIME tipa — sprečava upload izvršnog fajla prerušenog u `.jpg`.
3. **Nikad** se ne koristi originalno ime fajla poslato od klijenta (rizik od path traversal-a i kolizije imena) — server generiše novo ime: `UUID + originalna ekstenzija`.
4. `FileStorageService.store()` vraća javno dostupan URL (ili storage key koji se konvertuje u URL).
5. `UPDATE catalog_item SET image_url = :url WHERE id = :id`.

### 3.3 Serviranje i brisanje

- **Serviranje:** direktno preko CDN-a/reverse proxy-ja ispred storage bucket-a (preferirano — rasterećuje Spring Boot aplikaciju od streamovanja binarnog sadržaja), ili passthrough `GET` endpoint ako bucket nije javan.
- **Brisanje:** kad se `CatalogItem`/korisnički avatar zameni ili deaktivira, fizičko brisanje starog fajla je **asinhrono** (background job/event), ne u istoj transakciji kao DB update — sprečava da spor storage I/O uspori glavni request. Orphan-fajlovi (ostavljeni bez reference u bazi) se čiste periodičnim job-om — post-MVP unapređenje, ne kritično za MVP obim.
