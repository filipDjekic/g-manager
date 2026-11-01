# Development seed

[seed_playground.sql](../gm/src/main/resources/db/dev/seed_playground.sql) je eksplicitni development/test seed. Nije Flyway migracija i ne pokreće se pri startup-u. Sesija mora imati `@gmanager_allow_dev_seed=1`, što postavlja [seed-development.ps1](../scripts/seed-development.ps1). To je zaštita od slučajnog izvršavanja, ne provera identiteta production baze.

## Preduslovi

1. Isključivo razvojni MySQL iz root Compose-a, sa primenjenim aktuelnim migracijama V1-V41.
2. Postojeći nedeleted nalog **`owner@example.com` sa BCrypt hash-om**. SQL ga traži baš tim email-om; proizvoljan bootstrap owner nije dovoljan. Napraviti ga svojim `INITIAL_OWNER_EMAIL`/`INITIAL_OWNER_PASSWORD` pre seed-a.
3. Proveren backup ako u razvojnoj bazi već ima korisnih podataka. Seed briše/obnavlja redove sa sopstvenim determinističkim demo ID prefiksima i povezane demo podatke.

Demo nalozi dobijaju kopiju hash-a naloga `owner@example.com`. To nije nužno trenutno upisana vrednost `INITIAL_OWNER_PASSWORD`: provisioner ne menja već postojeću lozinku. Koristite poznatu lokalno postavljenu lozinku tog naloga; ne upisujte je u dokumentaciju.

## Pokretanje

Posle lokalnog starta, uspešnih migracija i bootstrap-a, iz korena:

```powershell
powershell.exe -NoProfile -File scripts/seed-development.ps1
```

Bash ekvivalent nad istom razvojnom Compose bazom:

```bash
(printf 'SET @gmanager_allow_dev_seed = 1;\n'; cat gm/src/main/resources/db/dev/seed_playground.sql) \
  | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot gmanager'
```

Skripta ne pokreće Docker ili migracije umesto korisnika. Navedene komande nisu izvršavane u dokumentacionom pregledu.

## Podaci i granice

SQL kreira 43 demo korisnika (OWNER, ADMIN, pet EMPLOYEE i 36 CUSTOMER), 14 kataloških stavki, radno vreme/izuzetke, relativno datirane rezervacije i 120 narudžbina. Sadrži i recurrence, audit, notifications/preferences, saved views, CRM, waitlist, time-off i report template/schedule podatke. Broj i datumi rezervacija zavise od petlje/UTC datuma; završni SQL upiti prikazuju stvarno generisane brojeve.

Fizički model **postoji**: seed uključuje lokacije, zone i PC/PS5/simulator/VIP resurse, kao i location dodele. Ne seeduje potpisane Client identitete ili stvarne document objekte. Ne postoji MANAGER rola; demo menadžer smene je EMPLOYEE.

Važno: seed upisuje `user_location_assignments`, ali ne `user_resource_assignments`. V38 migracija prenosi samo dodele koje postoje u trenutku migracije; seed pokrenut posle V38 ne daje sam te resource grant-ove. OWNER/ADMIN mora kroz upravljanje resursima dodeliti konkretne resurse zaposlenima. Station readiness/application profiles/enrollment podesiti posebno pre stvarnog gaming toka.

Demo prijave su `owner.demo@gmanager.test`, `admin.demo@gmanager.test`, `marko.employee@gmanager.test`, `jelena.employee@gmanager.test` i `kupac01@demo.gmanager.test` do `kupac36@demo.gmanager.test`; poslednji kupac i jedan zaposleni su neaktivni. Ove adrese su primeri iz SQL fixture-a, ne stvarni korisnici.

## Ponovno izvršavanje i reset

Ponovno izvršavanje osvežava demo skup, a ne kompletnu bazu. Validacije proveravaju broj generisanih rezervacija, trajanje, overlap, uloge/usluge i zbir narudžbina. Ne tvrditi da su proverile svaki constraint ili da je seed uspešno izvršen bez stvarnog rezultata.

Ne koristiti `docker compose down -v` kao uobičajen reset: briše sve podatke named volume-a, uključujući upload. Za namerni potpuni reset razvojne baze najpre sačuvati potrebne podatke, zatim ponoviti lokalno pokretanje/migracije/bootstrap/seed. Seed nikada ne uključivati u produkcioni pipeline.
