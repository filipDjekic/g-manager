# Backup i recovery

Postoje [backup.sh](../../ops/backup/backup.sh), [restore-drill.sh](../../ops/backup/restore-drill.sh) i operations servisi u [produkcijskom Compose-u](../../ops/deploy/compose.yml). Oni implementiraju logički DB backup i probni restore, ne kompletan disaster recovery baze, objekata, tajni i Windows stanica. Nijedna procedura nije izvršavana u ovom pregledu.

## Šta sačuvati

| Podaci | Obuhvat postojeće automatizacije | Potrebna dopuna operatora |
| --- | --- | --- |
| MySQL poslovna šema | `mysqldump --single-transaction --routines --triggers`, gzip, AES-256-CBC/PBKDF2, SHA-256 fajl | Off-host kopija, raspored, alarm za neuspeh i provera privilegija/tool verzije |
| Upload/document objekti | DB backup sadrži metapodatke, ne bytes | Snapshot `document_data`/lokalnog upload-a ili backup privatnog S3 bucket-a, upareno sa bazom |
| Secret/signing materijal | Nije u dump-u | Secret manager backup: JWT, DB, backup encryption key, backend policy key, code-signing recovery i public pin podaci |
| Deploy konfiguracija | `releases/current.env`, `previous.env`, candidate i image digests | Zaštićena kopija konfiguracije bez tajni, release checkout i kompatibilni image-i |
| Windows stanice | Server dump sadrži machine public identitet/stanje | Zaštićen lokalni identity/config/journal recovery plan; DPAPI fajl nije običan prenosiv ključ |

Backup ključ se čuva odvojeno od `.sql.gz.enc`; bez njega dump nije moguće dešifrovati. SHA-256 sidecar proverava slučajno oštećenje, nije nezavisan autentifikacioni potpis. Čuvati backup i checksum na pristupno zaštićenom mediju.

## Ručni DB backup

Preduslovi su iz [deployment vodiča](DEPLOYMENT.md): sve obavezne Compose promenljive, secrets, DB nalog `gmanager`, upisiv output za UID 10001 i razrešen `BACKUP_FILE` interpolation zahtev. Iz `ops/deploy/` sa postojećim release-om:

```bash
export BACKUP_FILE=/backup/output/pending.sql.gz.enc
docker compose --env-file releases/current.env --profile operations run --rm backup
```

Servis upisuje `ops/backup/output/gmanager-<UTC-timestamp>.sql.gz.enc` i `.sha256`. Default retention je 30 dana i čišćenje se dešava tek kada se backup skripta pokrene. Nema cron/scheduler servisa u Compose-u; deploy skripta pravi backup pri release-u, što nije dovoljan redovan raspored.

Proveriti izlazni kod i prisustvo oba fajla, kopirati ih van hosta i zabeležiti release, UTC vreme i vezani object snapshot. Dump ne navodi `--events` i ne čuva MySQL naloge/grant-ove; oni se obnavljaju odvojeno. Dok traje backup izbegavati paralelnu DDL migraciju; `--single-transaction` ne koordinira S3/lokalne objekte.

## Restore drill

Izaberite **stvarni** prethodno napravljen naziv, ne privremenu putanju:

```bash
export BACKUP_FILE=/backup/output/gmanager-<UTC-timestamp>.sql.gz.enc
docker compose --env-file releases/current.env --profile operations run --rm restore-drill
docker compose --env-file releases/current.env --profile operations up -d --wait restore-backend
docker compose --env-file releases/current.env --profile operations exec -T restore-backend curl --fail --silent http://127.0.0.1:9091/actuator/health/readiness
docker compose --env-file releases/current.env --profile operations rm -sf restore-backend
```

Placeholder `<UTC-timestamp>` zameniti konkretnim imenom. Skripta proverava checksum, dešifruje i uvozi dump u `gmanager_restore_drill`. **Briše i ponovo kreira samo tu ciljnu bazu pri svakom pokretanju**, pa je ne koristiti za podatke koje želite sačuvati. Dodeljuje prava hardkodovanom `gmanager` korisniku, proverava broj tabela, uspešnu Flyway verziju i devet session/machine tabela.

Restored backend proverava šemu i DB readiness, ali ima local document storage bez obnovljenih objekata. To nije potvrda ispravnog download-a, svih redova, poslovnih agregata, S3 oporavka ili fizičkog stanja stanica. Za realan drill odvojiti mrežu/okruženje i kontrolisati background jobs kako kopija ne bi pokretala operativne poslove.

## Oporavak nakon incidenta

1. Zaustaviti poslovne upise i zabeležiti release/digests, vreme incidenta i stanje servisa. Sačuvati sanitizovane logove, audit i journals; sprečiti dupli rad stare i obnovljene instance.
2. Izabrati provereni DB backup i pripadajući object snapshot. Sačuvati oštećene podatke pre bilo kakvog zamenskog restore-a.
3. Obnoviti u **novu izolovanu bazu/storage**, ne prepisivati jedinu produkcionu kopiju. Postojeći `restore-drill` je pomoć za probni import, a ne automatski production cutover alat.
4. Vratiti DB korisnike/grant-ove i potrebne tajne. Proveriti Flyway istoriju/checksum i kompatibilnost image-a; po potrebi primeniti samo odobrene nove migracije.
5. Validirati object checksum-e prema document metapodacima, download/preview, users/roles, rezervacije/narudžbine, jobs/outbox i gaming command/identity podatke. Testirati sa izolovanim nalozima.
6. Pre promene saobraćaja usaglasiti fizičke stanice: obnovljena baza može imati stariji command cursor ili sesiju koja se u međuvremenu završila. Ne vraćati cursor/`endsAt` ručno radi produženja. Koristiti operativni force-lock/reconciliation i proveru fizičkog lock-a.
7. Kontrolisano prebaciti konekciju/saobraćaj, uraditi smoke i funkcionalnu proveru, zatim pratiti greške, queue age, readiness i station alarme.
8. Zabeležiti stvarni gubitak podataka i vreme oporavka. Repo ne definiše niti dokazuje dostignuti RPO/RTO ili point-in-time recovery/binlog arhiviranje.

Povratak image-a kroz `rollback.sh` nije zamena za restore. Windows update rollback menja lokalne binarne fajlove i konfiguraciju, ne serverovu bazu ili billing. Lokalni Client recovery je u [WINDOWS_CLIENT.md](WINDOWS_CLIENT.md).
