# Baza podataka i migracije

Podržana runtime baza u konfiguraciji je MySQL 8.4. Root Compose koristi tag `mysql:8.4`, produkcioni Compose `mysql:8.4.5`. PostgreSQL iz stare specifikacije nije trenutni backend. Testni H2 radi u MySQL režimu i ne potvrđuje produkcionu kompatibilnost.

## Šema i vlasništvo

Jedini verzionisani izvor šeme je [gm/src/main/resources/db/migration](../../gm/src/main/resources/db/migration): **41 SQL migracija, V1–V41**. `flyway_schema_history` beleži primenjene verzije i checksum. JPA entiteti koriste `ddl-auto=validate`; Hibernate ne treba da kreira ili menja produkcione tabele.

| Migracije | Glavne oblasti |
| --- | --- |
| V1–V9 | Users, refresh tokens, avatar, catalog, working hours, reservations/idempotency, orders, FK i auth sessions |
| V10–V17 | Audit/soft delete, scoped idempotency, outbox, background jobs, indeksi, saved views, search i widget preferences |
| V18–V23 | Notifications, documents/versions, reports, istorijske workflow tabele, feature overrides i AI usage |
| V24–V29 | Time off, waitlist, recurrence, CRM, lokacije/zone/resursi i customer activation |
| V30–V36 | Station readiness, gaming lifecycle, komande/cursors, machine trust, session login, potpisana policy i enforcement/reconciliation |
| V37–V41 | `requires_resource`, employee-resource dodele, floor plan, waitlist management i Client management telemetry |

Postojanje tabele ne znači da postoji aktivan korisnički modul: workflow tabele su primer sačuvane istorije šeme bez aktuelnog workflow API-ja.

## Veze i vremenski model

`users` je zajednički identitet svih četiri uloga; CUSTOMER nije druga tabela identiteta. Catalog `SERVICE` poseduje cenu/trajanje, a `physical_resources` referencira uslugu i pripada zoni/lokaciji. Gaming PC je fizički resurs, station profil njegova operativna konfiguracija. Rezervacija i runtime gaming sesija ostaju odvojeni agregati.

`user_location_assignments` i `user_resource_assignments` imaju različitu ulogu. V38 je jednokratno prenela tadašnje location dodele na resurse; naknadna location dodela nije automatska resource dozvola. Konkretne resource dozvole proverava `ResourceAccessService`.

Timestamp-i i JDBC/Hibernate vreme su UTC. Poslovno radno vreme koristi IANA zonu; SQL kolone često koriste mikrosekundni `TIMESTAMP(6)`. Ne zamenjivati zonu fiksnim `+01:00`, jer postoje DST i smene preko ponoći.

Za konkurentnost postoje `version`, unique/FK/index pravila i eksplicitni row lock-ovi. Čuvati redosled customer → resource pri startu gaming sesije. Preklapanje termina proverava backend u transakciji; prikaz slobodnog mesta nije rezervacija mesta.

## Development i production migracije

- **Local:** jedan razvojni DB nalog može izvršavati Flyway pri startu. Za host backend uskladiti adresu/port i korisnika prema [lokalnom vodiču](../development/LOCAL_SETUP.md).
- **Test:** `application-test.yml` koristi efemernu H2 bazu. Test-only H2 migration adapter je deo test podrške; ne prepisuje produkcione SQL fajlove.
- **Prod:** `application-prod.yml` isključuje Flyway. `ops/deploy/compose.yml` ima `migrate` servis, Flyway 11.7.2 i zaseban `gmanager_migrator` nalog. Pokreće `validate`, `migrate`, `info` nad SQL-om iz checkout-a, pre starta novog backend image-a.

Produkcioni `mysql-init.sh` ograničava aplikacionog korisnika i daje migrator-u DDL prava. Trenutno hardkoduje naziv `gmanager`, pa secret `db_username` mora odgovarati tom imenu. Init skripta radi samo pri inicijalizaciji praznog data volume-a; promena environment-a ne popravlja postojeće grant-ove ili lozinke.

Checkout migracija mora odgovarati backend release-u. Ne menjati već primenjenu migraciju: korekcije su novi `V<n>__opis.sql` fajlovi. Rollback image-a ne vraća šemu; rollback je moguć samo uz kompatibilnu šemu ili unapred provereni restore. Ne koristiti `flyway clean` kao popravku produkcije niti `repair` bez objašnjenog checksum uzroka i kontrolisane odluke.

## Održavanje

Kod zastoja prvo proveriti DB konekciju, pool, lock wait i neuspelu migraciju; zapisati request ID i release. Ne uklanjati idempotency/cursor/lease redove nasumično radi odblokiranja UI-a. Outbox/job retry i retention imaju poslovni značaj i zahtevaju proveru tipa događaja, pokušaja i idempotentnosti potrošača.

Aktuelni seed se pokreće odvojeno, samo na razvojnoj bazi, prema [DEVELOPMENT_SEED.md](../DEVELOPMENT_SEED.md). Backup mora povezati bazu sa object storage-om i signing/operativnim podešavanjima; postupak je u [BACKUP_RECOVERY.md](../operations/BACKUP_RECOVERY.md).
