# Stage 18 — Global search i command palette

## Status i cilj

Stage 18 uvodi jednu, role-aware ulaznu tačku za pronalaženje kataloga,
korisnika, narudžbina i rezervacija. Implementacija je završena bez eksternog
search engine-a i bez promene postojećih pravila autorizacije.

Ovaj dokument je handoff za naredne stage-ove: beleži ugovore, odluke, mesta
implementacije i bezbednosne invarijante koje ne treba zaobići.

## Arhitektura i razlog odluke

`search` modul je orkestrator, ali ne pristupa repository-jima drugih modula.
Svaki domen implementira `SearchSource` iz `common.search` i u svom modulu
primenjuje postojeće capability/scope uslove pre nego što vrati minimalni
`SearchEntry`. Tek zatim `SearchService` rangira i spaja dozvoljene rezultate.

Ovaj smer zavisnosti je nameran:

- čuva modular-monolith granice i module-internal repository-je;
- sprečava da search postane paralelni authorization sistem;
- onemogućava count, preview i ranking side-channel za nedozvoljene resurse;
- omogućava dodavanje novog searchable modula bez menjanja facade ugovora.

Početna implementacija koristi ograničene JPA `LIKE`/exact query-je i najviše
pet kandidata po izvoru, odnosno 20 ukupno. FULLTEXT indeks nije dodat bez
merenog dokaza da je potreban. Ako produkciono p95 pređe Stage 14 budžet od
500 ms, sledeći korak je merenje na MySQL ciljnom datasetu, pa indeks ili search
adapter — ne uklanjanje permission filtera.

## Backend

Ključni ugovori su:

- `common.search.SearchResourceType` — stabilni tipovi `CATALOG`, `USER`,
  `ORDER`, `RESERVATION`;
- `common.search.SearchEntry` — minimalna interna projekcija;
- `common.search.SearchSource` — role-aware `search` i `findVisible` port;
- domen-specifični izvori u `catalog`, `user`, `order` i `reservation` modulima;
- `search.SearchService` — validacija, rate limit, merge/ranking, preferences i
  Micrometer metrike;
- `search.SearchController` — javni REST ugovor.

Ranking je determinističan: exact pogodak ima najveći rang, zatim prefix, pa
contains; rezultat se sekundarno sortira po naslovu. Query mora imati 2–100
štampivih znakova. Traženi limit se svodi na opseg 1–20. Search je ograničen na
60 zahteva po autentifikovanom korisniku u jednom minutu.

Korisnik vidi samo sopstvene orders/reservations kada ima `*_READ_OWN`, dok
management capability omogućava širi domen. Catalog read-only korisnici vide
samo aktivne, neobrisane stavke. User rezultati koriste postojeća role pravila,
uključujući zabranu da ADMIN pretražuje OWNER naloge.

## API

Svi endpoint-i zahtevaju autentifikaciju:

- `GET /api/v1/search?q={query}&limit={1..20}` — grupabilni rezultati svih
  dozvoljenih izvora;
- `GET /api/v1/search/preferences?favoritesOnly=true|false` — omiljene ili
  poslednje korišćene stavke trenutnog korisnika;
- `POST /api/v1/search/preferences` sa `{ "type": "ORDER", "id": "uuid",
  "favorite": true|false }` — beleži otvaranje i opciono favorite;
- `DELETE /api/v1/search/preferences?type=ORDER&id={uuid}` — uklanja favorite
  oznaku bez brisanja istorije poslednjeg pristupa.

Response sadrži samo `type`, `id`, `title`, `subtitle`, `url` i `favorite`.
Preferences se pri svakom čitanju ponovo proveravaju kroz `findVisible`, zato
promena role ili statusa resursa ne ostavlja zastareli authorization trag.

## Baza i migracija

Flyway `V16__create_search_preferences.sql` dodaje `search_preferences` sa:

- owner FK prema `users`;
- jedinstvenim `(owner_id, resource_type, resource_id)` ključem;
- `favorite` i `last_accessed_at` stanjem;
- owner/recent i owner/favorite indeksima;
- standardnim audit/version kolonama.

Tabela namerno čuva samo reference, ne kopije naslova ili drugih potencijalno
osetljivih podataka. Brisanje korisnika kaskadno uklanja njegove preferences.

## Frontend i UX

`CommandPalette` je montiran u `AppShell`. Otvara se dugmetom ili sa
`Ctrl+K`/`Cmd+K`; input dobija početni fokus. Combobox/listbox koriste ARIA
veze i `aria-activedescendant`, strelice menjaju izbor, Enter otvara rezultat,
a Escape zatvara dialog i vraća fokus. Na uskom ekranu dialog se prikazuje kao
search sheet.

Query se debounce-uje 250 ms. Promena query-ja ili zatvaranje palette prekida
prethodni HTTP zahtev pomoću `AbortController`. Highlight je sastavljen React
tekst čvorovima, bez `innerHTML`, pa query ne može postati XSS. Rezultati su
grupisani po resursu; prazan query prikazuje owner-isolated favorites i recents.
Deep link sadrži `focus` identifikator, a React Router state čuva
`searchReturnTo` putanju sa koje je palette otvorena.

Relevantni frontend slojevi su `src/api/searchApi.ts`,
`src/search/useGlobalSearch.ts`, `src/search/CommandPalette.tsx`, `AppShell` i
palette stilovi u `App.css`. Svi backend pozivi ostaju u `src/api` sloju.

## Privatnost i observability

Micrometer beleži `gm.search.duration` i `gm.search.requests` sa ishodom
`success`, `zero` ili `error`. Sirov query nije tag, log polje niti deo metrike.
Ne dodavati raw query u observability bez posebne privacy odluke.

## Test pokrivenost

- `SearchSecurityIntegrationTest` proverava own/all scope, ADMIN/OWNER
  vidljivost, inactive catalog, odsustvo metadata leakage-a, owner izolaciju,
  revalidaciju preferences, validaciju inputa i limit;
- `RateLimitServiceTest` proverava 60/min limit i izolaciju po korisniku;
- `useGlobalSearch.test.tsx` proverava debounce, cancel i preferences učitavanje;
- `CommandPalette.test.tsx` proverava shortcut, početni fokus, keyboard izbor i
  ozbiljne/kritične axe povrede;
- `MySqlSchemaIT` očekuje Flyway verziju 16.

MySQL/Testcontainers migracija i performance merenje moraju se pokrenuti u
okruženju sa Docker-om. Lokalno H2 test okruženje ostaje kompatibilno sa V16.

### Verifikacija 2026-08-10

- backend `clean test`: 96 testova, 0 failure, 0 error;
- search/security/rate-limit fokus: 7 testova, svi prolaze;
- frontend Vitest: 35 testova u 21 fajlu, svi prolaze;
- TypeScript typecheck i ESLint: prolaze;
- production build i bundle budget: prolaze (initial 326437 B, najveći route
  chunk 379649 B);
- `git diff --check`: prolazi, uz očekivana Git LF/CRLF upozorenja;
- MySQL/Testcontainers i ciljni p95 dataset: nisu izvršeni jer Docker CLI nije
  instaliran u verifikacionom okruženju. Ovo je jedini infrastrukturni
  verification blocker; nije zamenjen H2 rezultatom niti proglašen potvrđenim.

## Invarijante za naredne stage-ove

- Permission filter uvek ide pre centralnog rank/limit koraka.
- Preferences su uvek owner-scoped i revalidiraju trenutnu vidljivost.
- Search response ostaje minimalna projekcija; ne dodavati skrivena polja ili
  total count iz nefiltriranog skupa.
- Raw query se ne loguje.
- Novi searchable domen implementira `SearchSource` u svom modulu.
- Search engine/FULLTEXT uvodi se samo na osnovu ponovljivog MySQL merenja.
