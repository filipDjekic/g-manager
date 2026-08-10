# Stage 19 — Poslovni dashboard i pristupačne vizualizacije

## Status i cilj

Stage 19 proširuje postojeći dashboard aditivnim trendovima, poređenjem sa
prethodnim periodom, statusima rezervacija, opterećenjem zaposlenih, CSV
izvozom, drill-down linkovima i korisničkim rasporedom widgeta. Postojeći
`/summary` i `/today` ugovori ostaju kompatibilni.

Ovaj dokument je handoff za naredne stage-ove i izvor definicija metrika.

## Arhitektura

`dashboard` ostaje read/orchestration modul. Ne pristupa repository-jima drugih
domena: `OrderService`, `ReservationService`, `UserService` i
`WorkingHoursService` izlažu minimalne analytics projekcije ili proračun
kapaciteta, dok njihovi repository-ji ostaju module-internal.

Svi datumski parametri su poslovni `LocalDate`, granice se pretvaraju u
half-open `[fromStart, toPlusOneStart)` interval u `app.business-zone`
(`Europe/Belgrade`). Time DST dani ne pretpostavljaju fiksnih 24 časa. Opseg je
ograničen na najviše 366 dana. Prethodni period ima isti broj kalendarskih dana
i završava se dan pre trenutnog perioda.

Nije uveden cache ni nova analytics denormalizacija: nema merenog razloga.
Postojeće Stage 14 indekse treba proveriti MySQL `EXPLAIN`-om pre novih indeksa.

## Metric dictionary

| Metrika | Formula i izvor | Vremenska osa | Grain | Vlasnik |
| --- | --- | --- | --- | --- |
| Realizovani prihod | zbir `orders.total_price` gde je trenutni status `COMPLETED` | `orders.created_at` u poslovnoj zoni | dan | order domen |
| Završene narudžbine | broj orders sa trenutnim statusom `COMPLETED` | `orders.created_at` | dan | order domen |
| Rezervacije | broj rezervacija čiji `start_time` pripada periodu, svi statusi | `reservations.start_time` | dan | reservation domen |
| Status distribution | broj rezervacija grupisan po trenutnom statusu | `reservations.start_time` | period | reservation domen |
| Rezervisani minuti | trajanje `CONFIRMED` i `COMPLETED` rezervacija po zaposlenom | `start_time`/`end_time` | period/zaposleni | reservation domen |
| Kapacitet | zbir stvarno konfigurisanih poslovnih minuta, uključujući exceptions | lokalni kalendarski dan | period/zaposleni | working-hours domen |
| Iskorišćenost | `reserved_minutes / capacity_minutes * 100`; kada je kapacitet nula rezultat je `null`/N/D | isti period | zaposleni | dashboard derivacija |

Važno ograničenje: order model nema `completed_at`. Zato prihod i završene
narudžbine koriste datum kreiranja entiteta čiji je trenutni status COMPLETED.
Ako se doda lifecycle timestamp, metrika mora biti verzionisana i definicija
promenjena, ne tiho reinterpretirana.

Percent change je `(current - previous) / previous * 100`, zaokruženo na dve
decimale. Kada je previous nula, `percentChange` je `null` jer procenat nema
matematičku osnovicu; apsolutna promena ostaje dostupna.

## API

Svi novi endpoint-i zahtevaju `DASHBOARD_SUMMARY` i dodatno management proveru
u servisu:

- `GET /api/v1/dashboard/trends?from&to` — KPI current/previous, statusi i
  dnevni bucket-i;
- `GET /api/v1/dashboard/workload?from&to&employeeId?` — capacity/workload za
  sve ili jednog aktivnog zaposlenog;
- `GET /api/v1/dashboard/export?from&to&employeeId?&view=current|raw` — UTF-8
  CSV istog scope-a kao ekran;
- `GET /api/v1/dashboard/widget-preferences` — raspored trenutnog korisnika;
- `PUT /api/v1/dashboard/widget-preferences` — upsert vidljivosti, pozicije i
  opcionog threshold-a.

`summary` i `today` nisu menjani. Export ponovo računa isti permission-sensitive
read model; ne postoji privilegovan ili širi export query.

## Database

Flyway `V17__create_dashboard_widget_preferences.sql` dodaje owner-scoped
`dashboard_widget_preferences` sa FK prema `users`, jedinstvenim
`(owner_id, widget_key)` ključem i owner/position indeksom. Čuvaju se samo UX
preference (`position`, `visible`, `threshold`), nikakvi poslovni agregati.

## Frontend i chart decision guide

- Grupisani bar chart se koristi za dnevni vremenski trend orders/reservations;
  izbor ponovo koristi postojeći chart primitive i ostaje unutar route bundle budžeta.
- Pie chart se koristi samo za bounded status distribution sa pet poznatih
  kategorija.
- Bar chart se koristi za poređenje zaposlenih po utilization procentu.
- Svaki grafikon je `aria-hidden`; semantička tabela odmah ispod je potpuni,
  tastaturom dostupan i screen-reader fallback.
- Svaki panel navodi poslovnu definiciju i prikazuje empty stanje.
- KPI prikazuje current vrednost i percent comparison, ili jasnu poruku kada
  previous osnovica ne postoji.
- Status i employee redovi vode na postojeći `/reservations` ekran sa istim
  `status`/`employeeId`/`from`/`to` filterima; zato drill-down skup koristi iste
  vremenske granice kao agregat.
- CSV nudi `current` summary i `raw` dnevne bucket-e. Oba uključuju workload za
  aktivni filter.
- Widget preferences omogućavaju vidljivost, redosled i workload threshold.

Responsive layout prelazi na jednu kolonu; tabela ostaje horizontalno skrolabilna.

## Security i observability

Finansijski, team/workload i export podaci dostupni su samo OWNER/ADMIN
korisnicima sa `DASHBOARD_SUMMARY`. EMPLOYEE zadržava isključivo postojeći
operativni `/today` dashboard. Preferences su izolovane po ID-u autentifikovanog
korisnika.

Micrometer metrike:

- `gm.dashboard.query.duration{query=trends|workload}`;
- `gm.dashboard.range.days{query=trends}`;
- `gm.dashboard.export.duration`;
- `gm.dashboard.exports{view=current|raw}`.

Metrike ne sadrže employee ID, datume niti druge high-cardinality vrednosti.

## Eksplicitno blokirane metrike

Projekat nema team membership ni attendance/time-clock domen. Zbog toga Stage
19 namerno ne prikazuje team filter, formalno prisustvo, kašnjenje, odsustvo ili
prekovremeni rad. Working-hours predstavlja poslovno radno vreme, ne evidenciju
prisustva pojedinca. Te metrike se mogu dodati tek nakon pouzdanog izvora i
posebnih permission/privacy odluka.

## Testovi i invarijante

- `DashboardIntegrationTest`: aggregate fixture, current/previous matematika,
  poslovna zona, bucket zbir, workload minuti, CSV, bounded range,
  authorization i owner-isolated preferences;
- `DashboardPage.component.test.tsx`: metric definitions, table fallback,
  scoped drill-down i axe serious/critical provera;
- `MySqlSchemaIT` očekuje Flyway verziju 17.

Invarijante za naredne stage-ove:

- UI, API i CSV uvek koriste isti permission scope.
- Bucket i drill-down koriste isti half-open business-zone interval.
- `percentChange=null` kada je previous nula.
- Chart bez potpune tabele nije dozvoljen.
- Attendance/team metrika se ne izvodi iz working-hours.
- Novi indeks ili cache zahteva MySQL merenje/EXPLAIN.

## Verifikacija 2026-08-10

- backend `clean test`: 98 testova, 0 failure, 0 error;
- ciljani dashboard integration test: 5 testova, svi prolaze;
- frontend Vitest: 36 testova u 22 fajla, svi prolaze;
- dashboard component/axe test: prolazi bez serious/critical povreda;
- TypeScript typecheck i ESLint: prolaze;
- production build i bundle budget: prolaze; initial JavaScript 326437 B,
  najveći route chunk 385768 B;
- `git diff --check`: prolazi uz očekivana LF/CRLF upozorenja;
- MySQL/Testcontainers, `EXPLAIN` i ciljna performance suite nisu izvršeni jer
  Docker CLI nije dostupan u lokalnom okruženju. H2/Flyway V17 prolazi, ali se
  to ne predstavlja kao zamena za MySQL plan/performance potvrdu.
