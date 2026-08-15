# Development seed za G-Manager

`gm/src/main/resources/db/dev/seed_playground.sql` je eksplicitni development/test
seed za aktivnu igraonicu. Nije Flyway migracija, nije uključen u production image
startup i odbija izvršavanje bez session guard-a koji postavlja pomoćna skripta.

## Sadržaj

- 43 demo korisnika: 1 owner, 1 admin, 5 zaposlenih (jedan neaktivan) i 36 kupaca;
- 14 kataloških stavki: 6 usluga/igraoničkih ponuda i 8 proizvoda;
- realno radno vreme, noćne smene petkom/subotom i dve buduće exceptions;
- 212 rezervacija od 90 dana unazad do četiri nedelje unapred, uključujući
  completed, confirmed, pending, cancelled i rejected stanja i jednu recurrence seriju;
- 120 narudžbina sa tačno izračunatim stavkama i prihodima;
- audit istoriju statusa rezervacija, 24 notifikacije, preference, saved views,
  CRM profile/tagove/beleške, waitlist, time-off i report template/schedule podatke.

Projekat nema zaseban fizički resource/stanica entitet niti `MANAGER` rolu.
PC, PS5, simulator i VIP ponude zato koriste postojeći `SERVICE` model, a nalozi
isključivo postojeće `OWNER`, `ADMIN`, `EMPLOYEE` i `CUSTOMER` role. Dokumenti
nisu seedovani jer bi red bez stvarnog storage objekta bio neupotrebljiv.
Marko je poslovno označen kao menadžer smene, ali u bazi ispravno ostaje
`EMPLOYEE`, jer je to najbliži stvarno podržani enum.

## Pokretanje

Pokrenite sistem i zatim seed:

```powershell
docker compose up --build -d
powershell -ExecutionPolicy Bypass -File scripts/seed-development.ps1
```

Bash ekvivalent koristi isti session guard:

```bash
(printf 'SET @gmanager_allow_dev_seed = 1;\n'; cat gm/src/main/resources/db/dev/seed_playground.sql) \
  | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot gmanager'
```

Seed je idempotentan za sopstvene determinističke demo ID-jeve. Ponovno pokretanje
osvežava samo demo podatke i ne briše korisničke redove van demo prefiksa.

## Development nalozi

Svi demo nalozi koriste istu lozinku kao lokalni initial owner iz root `.env`
promenljive `INITIAL_OWNER_PASSWORD`. SQL kopira postojeći BCrypt hash; plain-text
lozinka se nikada ne upisuje u bazu.

| Role | Email | Password |
| --- | --- | --- |
| OWNER | `owner.demo@gmanager.test` | vrednost `INITIAL_OWNER_PASSWORD` iz `.env` |
| ADMIN | `admin.demo@gmanager.test` | vrednost `INITIAL_OWNER_PASSWORD` iz `.env` |
| EMPLOYEE | `marko.employee@gmanager.test` | vrednost `INITIAL_OWNER_PASSWORD` iz `.env` |
| EMPLOYEE | `jelena.employee@gmanager.test` | vrednost `INITIAL_OWNER_PASSWORD` iz `.env` |
| CUSTOMER | `kupac01@demo.gmanager.test` | vrednost `INITIAL_OWNER_PASSWORD` iz `.env` |

Kupci `kupac01` do `kupac36` prate isti email format; `kupac36` je neaktivan.

## Reset

Bez brisanja volume-a, samo ponovo pokrenite seed skriptu. Potpuni lokalni reset
briše sve MySQL i upload podatke i zato je namerno ručna, destruktivna operacija:

```powershell
docker compose down -v
docker compose up --build -d
powershell -ExecutionPolicy Bypass -File scripts/seed-development.ps1
```

Ne koristite `docker compose down -v` ako želite da sačuvate postojeće podatke.

## Ugrađena validacija i production zaštita

Seed radi u jednoj transakciji, ne isključuje foreign keys i prekida/rollback-uje
ako broj rezervacija, trajanje usluge, blocking overlap, role/type veze ili zbir
narudžbine nisu ispravni. Relativni datumi koriste UTC funkcije, dok su termini
izabrani tako da ostaju unutar konfigurisanog `Europe/Belgrade` radnog vremena
i tokom CET i tokom CEST perioda.

Production zaštita je višestruka: fajl je van `db/migration`, ne pokreće se
automatski, zahteva eksplicitni session guard i zavisi od lokalnog initial-owner
naloga. Nikada ga ne uključivati u production deployment pipeline.
