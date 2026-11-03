# Backup i recovery

Postoje [backup.sh](../../ops/backup/backup.sh), [backup-set.sh](../../ops/backup/backup-set.sh), [restore-drill.sh](../../ops/backup/restore-drill.sh) i operations servisi u [produkcijskom Compose-u](../../ops/deploy/compose.yml). Pilot test izvršava šifrovani DB/document backup i izdvojeni restore nad jednokratnim MySQL kontejnerom. To nije proba nad stvarnim dokumentima, produkcionim tajnama ili fizičkim stanicama.

## Šta sačuvati

| Podaci | Obuhvat postojeće automatizacije | Potrebna dopuna operatora |
| --- | --- | --- |
| MySQL poslovna šema | `mysqldump --single-transaction --routines --triggers --events`, gzip, AES-256-CBC/PBKDF2, SHA-256 fajl | Off-host kopija, aktiviranje rasporeda, alarm za neuspeh i provera privilegija/tool verzije |
| Upload/document objekti | `backup-set` šifruje lokalni `document_data` i pravi manifest para sa DB backup-om | Pauzirati upise i GC tokom celog seta; za S3 sačuvati upareni bucket snapshot/versioned objekte |
| Secret/signing materijal | Nije u dump-u | Secret manager backup: JWT, DB, backup encryption key, backend policy key, code-signing recovery i public pin podaci |
| Deploy konfiguracija | `releases/current.env`, `previous.env`, candidate i image digests | Zaštićena kopija konfiguracije bez tajni, release checkout i kompatibilni image-i |
| Windows stanice | Server dump sadrži machine public identitet/stanje | Zaštićen lokalni identity/config/journal recovery plan; DPAPI fajl nije običan prenosiv ključ |

Backup ključ se čuva odvojeno od `.sql.gz.enc`; bez njega dump nije moguće dešifrovati. SHA-256 sidecar proverava slučajno oštećenje, nije nezavisan autentifikacioni potpis. Čuvati backup i checksum na pristupno zaštićenom mediju.

## Ručni DB backup

Preduslovi su iz [deployment vodiča](DEPLOYMENT.md): sve obavezne Compose promenljive, secrets, DB nalog `gmanager` i upisiv output za UID 10001. Iz `ops/deploy/` sa postojećim release-om:

```bash
docker compose --env-file releases/current.env --profile operations run --rm backup
```

Servis upisuje `ops/backup/output/gmanager-<UTC-timestamp>-<suffix>.sql.gz.enc` i `.sha256`, sa relativnim nazivom u checksum fajlu. Ne objavljuje uspešan backup ako dump/gzip/encryption nisu uspeli. Default retention je 30 dana, samo za backup-e odgovarajuće baze. Tajne ne prosleđuje kao OpenSSL argument sa lozinkom.

Za dnevni raspored aktivirati `docker compose --env-file releases/current.env --profile backup-scheduled up -d backup-scheduler`. `BACKUP_INTERVAL_SECONDS` menja interval; healthcheck proverava poslednji uspeh. Alarm na unhealthy/stopped kontejner povezati sa monitoringom hosta. Deploy backup nije dovoljan raspored.

Za uparene lokalne dokumente zaista pauzirati API upise i document GC, postaviti `BACKUP_WRITES_QUIESCED=true`, pa izvršiti `docker compose --env-file releases/current.env --profile operations run --rm backup-set`. Svi fajlovi iz `.manifest` moraju biti sačuvani zajedno. Flag potvrđuje operatorovu prethodnu radnju; skripta sama ne pauzira backend. Dnevni DB scheduler ne podrazumeva document snapshot.

Proveriti izlazni kod i prisustvo oba fajla, kopirati ih van hosta i zabeležiti release, UTC vreme i vezani object snapshot. MySQL nalozi/grant-ovi obnavljaju se odvojeno. Dok traje backup izbegavati paralelnu DDL migraciju; `--single-transaction` ne koordinira S3/lokalne objekte.

## Restore drill

Izaberite **stvarni** prethodno napravljen naziv, ne privremenu putanju:

```bash
export BACKUP_FILE=/backup/output/gmanager-<UTC-timestamp>-<suffix>.sql.gz.enc
docker compose --env-file releases/current.env --profile operations run --rm restore-drill
docker compose --env-file releases/current.env --profile operations up -d --wait restore-backend
docker compose --env-file releases/current.env --profile operations exec -T restore-backend curl --fail --silent http://127.0.0.1:9091/actuator/health/readiness
docker compose --env-file releases/current.env --profile operations rm -sf restore-backend
```

Placeholder zameniti konkretnim imenom. Skripta proverava checksum, potpuno dešifrovanje i gzip **pre** promene baze. Zahteva `RESTORE_ISOLATED=true` (Compose ga postavlja) i dozvoljava samo `gmanager_restore_drill` ili njegov test sufiks. **Briše i ponovo kreira tu izdvojenu šemu**, pa je ne koristiti za podatke koje želite sačuvati. `RESTORE_DB_USER` je po default-u `gmanager`. Proverava tabele, Flyway i finansijske invariante iz `ledger-check.sql`.

Restored backend proverava šemu i DB readiness; outbox i jobs su isključeni. Za document drill proveriti checksum dokument arhive, dešifrovati je i raspakovati u **nov prazan izdvojeni volume**, povezati samo test backend i proveriti stvarni download/hash. Ne raspakovati preko postojeće storage kopije. Sama DB readiness nije potvrda svih redova, S3 oporavka ili fizičkog stanja stanica.

## Oporavak nakon incidenta

1. Zaustaviti poslovne upise i zabeležiti release/digests, vreme incidenta i stanje servisa. Sačuvati sanitizovane logove, audit i journals; sprečiti dupli rad stare i obnovljene instance.
2. Izabrati provereni DB backup i pripadajući object snapshot. Sačuvati oštećene podatke pre bilo kakvog zamenskog restore-a.
3. Obnoviti u **novu izolovanu bazu/storage**, ne prepisivati jedinu produkcionu kopiju. Postojeći `restore-drill` je pomoć za probni import, a ne automatski production cutover alat.
4. Vratiti DB korisnike/grant-ove i potrebne tajne. Proveriti Flyway istoriju/checksum i kompatibilnost image-a; po potrebi primeniti samo odobrene nove migracije.
5. Validirati object checksum-e prema document metapodacima, download/preview, users/roles, rezervacije/narudžbine, jobs/outbox i gaming command/identity podatke. Testirati sa izolovanim nalozima.
6. Pre promene saobraćaja usaglasiti fizičke stanice: obnovljena baza može imati stariji command cursor ili sesiju koja se u međuvremenu završila. Client odbija rollback sa `SERVER_STATE_ROLLBACK`. Ne smanjivati lokalni cursor, brisati snapshot ili menjati `endsAt` da bi se provera zaobišla. Koristiti operativni force-lock/reconciliation i fizičku proveru; ako je potreban reprovisioning, opozvati stari identitet i izvršiti kontrolisanu administratorsku pripremu. Do završene provere stanica ostaje van upotrebe.
7. Kontrolisano prebaciti konekciju/saobraćaj, uraditi smoke i funkcionalnu proveru, zatim pratiti greške, queue age, readiness i station alarme.
8. Zabeležiti stvarni gubitak podataka i vreme oporavka. Repo ne definiše niti dokazuje dostignuti RPO/RTO ili point-in-time recovery/binlog arhiviranje.

Povratak image-a kroz `rollback.sh` nije zamena za restore. Windows update rollback menja lokalne binarne fajlove i konfiguraciju, ne serverovu bazu ili billing. Lokalni Client recovery je u [WINDOWS_CLIENT.md](WINDOWS_CLIENT.md).
