# G-Manager Frontend — Arhitektonska Specifikacija

**Kontekst:** Frontend pandan kompletnoj backend arhitekturi. Prati "Backend First" — ova specifikacija se implementira tek kada je backend API ugovor zamrznut i testiran (Faza 7+ iz Engineering Plana).

---

## 1. Tech Stack

| Sloj | Izbor | Obrazloženje |
|---|---|---|
| Jezik | TypeScript (strict mode) | 1:1 tipizacija sa backend DTO-ovima; `strict: true` u `tsconfig.json` (bez `any` u domenskom kodu). |
| Build tool | Vite | Brz dev server, native ESM, jednostavna konfiguracija u odnosu na CRA/Webpack. |
| Server state / data fetching | **TanStack Query (React Query) v5** | Keširanje, deduplikacija paralelnih zahteva, automatski refetch/invalidate nakon mutacija (npr. nakon `PATCH status`, invalidira se lista rezervacija). Server state se **nikad** ne duplira u Zustand/Context — to je česta greška koju ovde eksplicitno izbegavamo. |
| Client/Auth state | **Zustand** | Isključivo za "efemerno" stanje koje nije server podatak: trenutni korisnik, access token (u memoriji), UI toggle-ovi. Lakše od Redux-a, bez boilerplate-a. |
| Routing | **React Router v6** (`createBrowserRouter`, ugnježdene rute) | Ugnježdene rute prirodno prate `AppShell → ProtectedRoute → RoleGuard → Page` hijerarhiju (Deo 4). |
| Forme i validacija | **React Hook Form + Zod** (`@hookform/resolvers/zod`) | Zod šeme **ručno održavane 1:1** sa backend Bean Validation anotacijama (nema auto-generisanja iz OpenAPI-ja u MVP obimu — potencijalno post-MVP unapređenje). |
| UI biblioteka / styling | **Tailwind CSS + shadcn/ui** | Utility-first stilizacija + pristupačne, neobrendovane komponente (Dialog, Toast, Dropdown) kao osnova, ne gotov "look" koji se teško menja. |
| Tabele | **TanStack Table** | Headless — vezuje se direktno na `PageResponse<T>` oblik sa backenda (server-side paginacija/sort, ne client-side). |
| Grafikoni (Dashboard) | **Recharts** | Za agregatne prikaze (`DashboardSummaryResponse`). |
| HTTP klijent | **Axios** | Interceptor API pogodniji za centralizovano rukovanje JWT/Idempotency-Key/greškama nego native `fetch`. |

---

## 2. Mapa Stranica i Funkcionalnosti po Rolama

### 2.1 Javne / Auth rute

| Stranica | Ruta | Funkcionalnosti |
|---|---|---|
| `LoginPage` | `/login` | Email + lozinka forma (Zod: `email` format, `password` min 8). Poziva `authApi.login` → uspeh puni Zustand auth store i preusmerava po roli (`OWNER/ADMIN → /dashboard`, `EMPLOYEE → /dashboard`, `CUSTOMER → /catalog`). Prikaz 401 greške inline ("neispravni kredencijali"). |
| `RegisterPage` | `/register` | Forma (`name`, `email`, `password`) — kreira isključivo `CUSTOMER` nalog. Nakon uspeha, preusmerava na `/login` (ne auto-login — backend ne vraća token pri registraciji). |

### 2.2 Shared (svaka autentifikovana rola)

| Stranica | Ruta | Funkcionalnosti |
|---|---|---|
| `ProfilePage` | `/profile` | Prikaz `name/email/role` (email i role read-only). Forma za izmenu `name` (`PATCH /users/me`). Odvojena "Promena lozinke" sekcija (trenutna + nova lozinka, poseban `/users/me/password` poziv). |

### 2.3 CUSTOMER

| Stranica | Ruta | Funkcionalnosti |
|---|---|---|
| `CatalogPage` | `/catalog` | Grid/lista `CatalogItem` (samo `active=true`). Filter traka: `type` (PRODUCT/SERVICE toggle), `search` (ime), opciono `minPrice/maxPrice`. `SERVICE` stavke imaju dugme **"Zakaži termin"** (vodi na booking flow), `PRODUCT` stavke imaju **"Dodaj u korpu"**. |
| `MyReservationsPage` | `/my-reservations` | **(a)** Lista sopstvenih termina sa status bedžom i filterom po statusu. **(b)** Booking flow (modal ili wizard): izbor usluge (iz kataloga) → izbor zaposlenog (`GET /users?role=EMPLOYEE`) → prikaz dostupnosti (kalendar/time-slot picker koji vizuelno kombinuje `WorkingHours` i postojeće termine tog zaposlenog — čisto UX pomoć, **stvarna validacija je uvek na backendu**) → potvrda šalje `POST /reservations` sa generisanim `Idempotency-Key`. **(c)** Dugme "Otkaži" — vidljivo samo za `PENDING`/`CONFIRMED`; ako je `CONFIRMED` i blizu cutoff-a, prikazati upozorenje pre slanja (klijentska procena, backend je izvor istine za konačnu odluku). |
| `MyOrdersPage` | `/my-orders` | **(a)** Korpa (`OrderCart` komponenta) — dodavanje proizvoda sa količinom, prikaz cene **samo kao read-only informacija** iz kataloga (klijent ne šalje cenu). Submit → `POST /orders` sa `Idempotency-Key`. **(b)** Lista sopstvenih narudžbina sa statusom. Dugme "Otkaži" vidljivo samo dok je `status === CREATED`. |

### 2.4 EMPLOYEE

| Stranica | Ruta | Funkcionalnosti |
|---|---|---|
| `DashboardPage` | `/dashboard` | `GET /dashboard/today` — broj `PENDING` termina koji čekaju njegovu potvrdu, broj potvrđenih termina danas, broj nepreuzetih narudžbina, broj narudžbina koje trenutno obrađuje. |
| `ReservationsPage` | `/reservations` | Lista termina (default filter `employeeId = self`). Dugmad **Potvrdi**/**Odbij** vidljiva samo za `PENDING`. Dugme **Označi završeno** vidljivo za `CONFIRMED`, ali **disabled** dok `Instant.now() < endTime` (frontend prikazuje countdown/tooltip "dostupno nakon HH:mm" — čisto UX, backend ionako odbija pre isteka). |
| `OrdersPage` | `/orders` | Lista narudžbina. Dugme **Preuzmi** vidljivo za `CREATED` (bilo koji EMPLOYEE). **Označi spremno**/**Označi preuzeto** vidljivi samo ako `handledBy === currentUser.id`. |
| `CatalogReadOnlyPage` | `/catalog` (ista ruta kao Customer, drugačiji render) | Isti podaci kao `CatalogPage`, ali **bez** edit/deaktivacija dugmadi — komponenta se grana po roli (`useAuth().user.role`), ne po posebnoj ruti. |

### 2.5 ADMIN (implicitno nasleđuje sve EMPLOYEE mogućnosti nad Orders/Reservations, sa punom vidljivošću — ne samo `self`)

| Stranica | Ruta | Funkcionalnosti |
|---|---|---|
| `DashboardPage` | `/dashboard` | `GET /dashboard/summary` sa opsegom datuma (date-range picker). Recharts: linijski/bar grafikon prihoda, pie chart rezervacija po statusu. |
| `CatalogPage` (management) | `/catalog` | Pun CRUD: kreiranje/izmena forma sa `type` toggle-om koji **uslovno prikazuje** `durationMinutes` polje (Zod `.superRefine` — `SERVICE` zahteva `durationMinutes`, `PRODUCT` ga zabranjuje, isto pravilo kao backend cross-field validacija). Dugme "Deaktiviraj". |
| `EmployeesPage` | `/employees` | Lista `EMPLOYEE` naloga. Forma za kreiranje novog EMPLOYEE-a. Dugme "Deaktiviraj" (ADMIN ne vidi OWNER/druge ADMIN naloge u listi — server ionako filtrira, frontend ne mora dodatno sakrivati). |
| `OrdersPage` / `ReservationsPage` | `/orders`, `/reservations` | Isto kao Employee verzija, ali **bez** `employeeId`/`handledBy` self-filtera — vidi i menja sve zapise, sa filter trakom (zaposleni, status, opseg datuma). |

### 2.6 OWNER (sve od ADMIN, plus)

| Stranica | Ruta | Funkcionalnosti |
|---|---|---|
| `UsersPage` | `/users` | Lista **svih** korisnika (OWNER, ADMIN, EMPLOYEE — filtrirano po roli). Kreiranje ADMIN/EMPLOYEE naloga sa izborom role. Deaktivacija bilo kog naloga osim sopstvenog. |
| `SettingsPage` | `/settings` | **(a)** Editor radnog vremena — 7 redova (po danu), `openTime`/`closeTime`/`active` po danu, uz vizuelnu naznaku "smena prelazi ponoć" ako `closeTime < openTime`. **(b)** Upravljanje izuzecima (`WorkingHoursException`) — kalendarski prikaz, dodavanje praznika (ceo dan zatvoreno ili skraćeno radno vreme). |

---

## 3. Arhitektura i Struktura Projekta

Struktura foldera je već definisana u Engineering Plan dokumentu (Deo 3) i ostaje nepromenjena. Fokus ovde je na **mapiranju tipova**.

### 3.1 Princip mapiranja Backend DTO → Frontend TypeScript

**Pravilo:** Za svaki backend Response/Request DTO postoji **tačno jedan** odgovarajući TS `interface`, istih naziva polja (camelCase se poklapa prirodno), istog nullability-ja. Enumi se mapiraju kao TS **union tipovi stringova** (ne TS `enum` — union tipovi se bolje slažu sa JSON serijalizacijom i Zod šemama).

```typescript
// types/enums.ts — jedini izvor istine za sve enume, mapiran 1:1 sa backend enumima
export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';
export type ItemType = 'PRODUCT' | 'SERVICE';
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type OrderStatus = 'CREATED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
```

```typescript
// types/api.types.ts
export interface ApiError {
  timestamp: string;    // Instant (UTC ISO-8601) — String na frontendu, nikad Date direktno
  status: number;
  error: string;
  message: string;
  path: string;
  requestId: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
```

```typescript
// types/reservation.types.ts
export interface ReservationResponse {
  id: string;              // UUID
  customerId: string;      // UUID
  employeeId: string;      // UUID
  serviceId: string;       // UUID
  startTime: string;       // Instant — konvertuje se u lokalni prikaz TEK u komponenti (date-fns-tz), nikad ranije
  endTime: string;
  status: ReservationStatus;
  note: string | null;
  createdAt: string;
}

export interface CreateReservationRequest {
  employeeId: string;
  serviceId: string;
  startTime: string;       // klijent šalje UTC ISO string; endTime se NE šalje (backend računa)
  note?: string;
}
```

**Pravilo za novčana polja (`BigDecimal` na backendu):** Jackson serijalizuje `BigDecimal` kao JSON broj → TS tip `number`. **Frontend nikad ne radi autoritativnu aritmetiku nad cenama** (ne sabira `lineTotal` da bi "proverio" `totalPrice`) — sve novčane vrednosti su isključivo **prikazne**, uvek formatirane preko jedne zajedničke `formatCurrency()` utility funkcije (`toFixed(2)` + lokalizacija), da se izbegnu floating-point nekonzistentnosti u prikazu na više mesta.

**Pravilo za `Instant` polja:** Uvek TS `string` tip (ISO-8601 UTC), **nikad** se ne konvertuje u `Date` objekat na nivou tipa/state-a — konverzija u lokalni prikaz (`Europe/Belgrade`) dešava se isključivo unutar prezentacione komponente (`date-fns-tz` ili `Intl.DateTimeFormat` sa eksplicitnim `timeZone`), tik pred renderovanje. Ovo sprečava da se "zaboravljena" `Date` konverzija provuče kroz nekoliko slojeva state-a i izazove suptilnu vremensku grešku.

---

## 4. Auth, Routing & Security na Frontendu

### 4.1 Auth Store (Zustand)

```typescript
interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  isInitializing: boolean;   // true dok traje "silent refresh" pri učitavanju aplikacije
  login: (token: string, user: UserResponse) => void;
  logout: () => void;
}
```

- `accessToken` se čuva **isključivo u memoriji** (Zustand store), nikad u `localStorage`/`sessionStorage` — smanjuje XSS izloženost, u skladu sa Refresh Token specifikacijom.
- Pri učitavanju aplikacije (`App.tsx` mount), automatski se poziva `POST /auth/refresh` (refresh token stiže server-side kroz `HttpOnly` kolačić, frontend ga nikad direktno ne vidi/šalje ručno) — ako uspe, popunjava se `accessToken`/`user`; ako ne uspe, korisnik se tretira kao neautentifikovan (bez eksplicitnog redirecta dok se ne pokuša pristup zaštićenoj ruti).

### 4.2 `ProtectedRoute`

```tsx
function ProtectedRoute() {
  const { user, isInitializing } = useAuthStore();
  if (isInitializing) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

### 4.3 `RoleGuard`

```tsx
function RoleGuard({ allowedRoles }: { allowedRoles: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <Outlet />;
}
```

**Primer kompozicije ruta:**
```tsx
<Route element={<ProtectedRoute />}>
  <Route element={<AppShell />}>
    <Route path="/profile" element={<ProfilePage />} />

    <Route element={<RoleGuard allowedRoles={['OWNER', 'ADMIN']} />}>
      <Route path="/employees" element={<EmployeesPage />} />
    </Route>

    <Route element={<RoleGuard allowedRoles={['OWNER']} />}>
      <Route path="/users" element={<UsersPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>

    <Route path="/catalog" element={<CatalogPage />} />  {/* interno se grana po roli */}
  </Route>
</Route>
```

**Napomena:** `RoleGuard` je isključivo **UX zaštita** (sprečava prikaz nedostupne stranice) — **ne** zamenjuje backend autorizaciju. Svaka ruta i dalje mora proći identičnu proveru na serveru; frontend guard postoji da korisnik ne dođe do ekrana koji će mu ionako vratiti 403, ne kao bezbednosna granica sama po sebi.

### 4.4 Axios Interceptor — Request

```typescript
axiosInstance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**Idempotency-Key — kritično pravilo:** Ključ se **generiše na mestu poziva mutacije** (u `useMutation` iz TanStack Query, npr. `createReservationMutation.mutate({ ...data, idempotencyKey: crypto.randomUUID() })`), **ne** unutar samog Axios interceptor-a. Razlog: ako bi se ključ generisao u interceptor-u, svaki automatski retry (mrežni timeout, TanStack Query retry logika) bi dobio **nov** ključ, čime bi se sama svrha idempotencije poništila — retry bi trebalo da ponovi **isti** zahtev, ne da izgleda kao nov. Konkretno:

```typescript
function useCreateReservation() {
  return useMutation({
    mutationFn: (data: CreateReservationRequest) => {
      const idempotencyKey = crypto.randomUUID();  // generisano JEDNOM, van retry petlje
      return axiosInstance.post('/reservations', data, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
    },
    retry: 2,  // isti idempotencyKey se šalje pri svakom retry pokušaju iste mutationFn invokacije
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations'] }),
  });
}
```

### 4.5 Axios Interceptor — Response (centralizovano rukovanje greškama)

```typescript
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const status = error.response?.status;
    const apiError = error.response?.data;

    switch (status) {
      case 401: {
        const refreshed = await tryRefreshToken();      // POST /auth/refresh (jednom, sa mutex-om protiv paralelnih 401-ova)
        if (refreshed) return axiosInstance(error.config!);  // ponovi originalni zahtev sa novim tokenom
        useAuthStore.getState().logout();
        window.location.href = '/login';
        break;
      }
      case 403:
        toast.error(apiError?.message ?? 'Nemate dozvolu za ovu akciju.');
        break;
      case 409:
        toast.error(apiError?.message ?? 'Podaci su izmenjeni u međuvremenu. Osvežavamo prikaz.');
        queryClient.invalidateQueries();  // generički refresh — jedinstven handler za state-machine, optimistic-lock i idempotency konflikte
        break;
      case 422:
        toast.error(apiError?.message ?? 'Podaci nisu validni.');
        break;
      case 429:
        toast.error('Previše pokušaja. Sačekajte i pokušajte ponovo.');
        break;
    }
    return Promise.reject(error);
  }
);
```

**Zašto je 409 hendlovan generički (`invalidateQueries()` bez specifičnog query key-a):** U skladu sa ranije uspostavljenom konvencijom (Idempotency & Optimistic Locking specifikacija, Deo 2.4) — pošto backend vraća **identičan** `ApiError` oblik za sve vrste 409 konflikata (state machine, optimistic lock, idempotency reuse), frontend namerno **ne grana** logiku po izvoru 409 greške; jedan handler pokriva sve slučajeve, uz opciono suženje `invalidateQueries({ queryKey: [...] })` na konkretan resurs ako je `error.config.url` dovoljno specifičan da se izvede tačan query key.

**403 se namerno ne redirect-uje** (za razliku od 401) — korisnik ostaje na istoj stranici, samo vidi toast poruku; to je najčešće posledica UI koji je propustio da sakrije dugme za akciju koju ta rola ne sme (bug koji treba prijaviti/popraviti u UI-ju, ne razlog za izbacivanje korisnika iz aplikacije).
