# Backup i recovery

Produkcioni backup-scheduler automatski izvršava scheduled-backup.sh: konzistentan set cele baze i referenciranih local/S3 dokumenata, lokalno šifrovanje, restic off-site upload i periodični izolovani restore. Aktivna baza se ne prepisuje.

## Podešavanje

Obezbediti [deployment secrets/variables](DEPLOYMENT.md), zaseban HTTPS S3 restic repository i mrežnu rutu. Inicijalizovati jednom, tek posle provere da je repository nov i namenski:

```bash
cd ops/deploy
python3 release_config.py compose "$DEPLOY_STATE_DIR/current.json" run --rm -T --no-deps \
  --entrypoint /bin/bash backup-scheduler -ec \
  'export AWS_ACCESS_KEY_ID=$(cat /run/secrets/restic_access_key) AWS_SECRET_ACCESS_KEY=$(cat /run/secrets/restic_secret_key); exec restic init'
```

Za inicijalizaciju pre prvog deployment-a koristite validirani candidate.json umesto current.json. Ne inicijalizovati postojeći repository i ne menjati ključeve običnim release-om.

Default: 86400 sekundi, retention 30 dana, restore svaki sedmi uspešan set i pri prvom ciklusu. Parametri: BACKUP_INTERVAL_SECONDS, BACKUP_RETENTION_DAYS, BACKUP_RESTORE_INTERVAL. Scheduler pokušava odmah nakon starta, zatim čeka interval; neuspeh ponavlja najkasnije za pet minuta. Monitoring prati konfigurisani interval.

## Konzistentnost i obuhvat

Privatni /internal/backup API zahteva poseban coordination secret. Lease blokira nove poslovne upise i čeka započete transakcije. Mutirajući zahtev dobija 503/Retry-After pre idempotency claim-a; retry mora zadržati isti Idempotency-Key. Heartbeat, signed lease i lock ACK nastavljaju da rade.

Scheduler koristi odvojeni gmanager_backup nalog; BACKUP_DB_PASSWORD ne daje INSERT/UPDATE/DELETE prava nad aktivnim poslovnim redovima. Dump definicija zahteva odgovarajuće SHOW VIEW/TRIGGER/EVENT/EXECUTE privilegije. Backend strimuje referencirane objekte uz proveru veličine/SHA; native MySQL klijent pravi single-transaction dump dok lease važi. Provera nakon dump-a odbacuje set posle restarta/isteka. Plaćeni session endsAt ostaje isti. Maksimalna pauza je deset minuta; izmeriti vreme sa stvarnim dataset-om. Dump proces koristi GNU timeout (300 sekundi podrazumevano); mysqldump nema mysql CLI opciju --connect-timeout. Za operatorski run može se eksplicitno proslediti -e BACKUP_DUMP_TIMEOUT_SECONDS=540 (dozvoljeno 30–540).

Set sadrži encrypted SQL/gzip, encrypted ZIP dokumenata, relativne SHA, manifest i javni release.json sa image digest-ima, Client/publisher pin-ovima i javnim policy ključem aktivnog backenda. Privatni ključevi i lozinke nisu deo recovery metapodataka. Cela poslovna šema obuhvata finansije/ledger, rezervacije, korisnike, gaming sesije i javne machine identitete. Nereferencirani objekti ne ulaze u automatski set. JWT/DB/policy privatni i code-signing ključevi čuvaju se odvojeno u recovery secret manager-u.

Restic obezbeđuje autentifikovano šifrovan repository. Lokalni AES-256-CBC/PBKDF2 i SHA sami nisu nezavisan autentifikacioni potpis; ograničiti pristup kopijama/sidecar-ima i držati ključ odvojeno.

## Provera

```bash
cd ops/deploy
python3 release_config.py compose "$DEPLOY_STATE_DIR/current.json" logs --tail=100 backup-scheduler
python3 release_config.py compose "$DEPLOY_STATE_DIR/current.json" exec -T backup-scheduler cat /backup/output/status.json
python3 release_config.py compose "$DEPLOY_STATE_DIR/current.json" exec -T backup-scheduler /backup/scheduled-backup.sh
```

Poslednja komanda ručno pokreće novi koordinisani ciklus. OS file lock odbija paralelni ciklus kodom 75. Scheduler prosleđuje signal svojoj procesnoj grupi i daje cleanup-u do 90 sekundi pri kontrolisanom gašenju; kod nasilnog prekida privatni write barrier ističe najkasnije za deset minuta. Status razlikuje pokušaj/uspeh/off-site/restore i fazu greške. Neuspešan upload ne pomera poslednji uspeh. Retention obuhvata samo pripadajuće stare lokalne sets/set-* direktorijume i restic host/tag snapshot-e posle potvrđenog upload-a.

Periodični restore preuzima baš uploadovani set iz restic-a, proverava dešifrovanje i ZIP integritet i vraća dump u gmanager_restore_drill_scheduled; proverava Flyway, poslovne/machine tabele i ledger. gmanager_restore_verifier nema pristup poslovnoj šemi. Deploy dodatno migrira gmanager_restore_drill i proverava novi backend nad njom. To nije puna document UI ili fizička Windows proba.

DB-only backup.sh i operatorski backup-set.sh ostaju dostupni. Drugi zahteva eksplicitno zaustavljene upise i lokalni storage. Ručni izolovani drill:

```bash
export BACKUP_FILE=/backup/output/EXACT-VERIFIED-NAME.sql.gz.enc
python3 release_config.py compose "$DEPLOY_STATE_DIR/current.json" --profile operations run --rm -T restore-drill
```

Izabrati tačan izlaz backup komande, bez ls/head nagađanja. Drill proverava checksum i dešifrovanje pre SQL-a, zahteva RESTORE_ISOLATED=true i dozvoljava samo gmanager_restore_drill* šeme. Nije alat za automatski production cutover.

## Incident

1. Zaustaviti nove upise, izdvojiti/zaključati stanice, sačuvati oštećenu instancu i volumes.
2. Izabrati upareni set i odvojeno obezbediti ključeve.
3. Vratiti u novu izolovanu infrastrukturu. Proveriti SQL/objekte, grant-ove, Flyway i image kompatibilnost.
4. Proveriti ledger, paid time, rezervacije, identities, outbox/jobs i document download. Sprečiti slanje stvarnih obaveštenja iz probe.
5. Client mora odbiti stariji command cursor sa SERVER_STATE_ROLLBACK. Ne smanjivati cursor, brisati zaštitni snapshot ili produžavati endsAt. Koristiti podržani reconciliation/force-lock i kontrolisani reprovisioning, uz fizičku proveru.
6. Posle acceptance provere kontrolisano prebaciti saobraćaj i pratiti alarme.

Zabeležiti stvarni gubitak podataka i vreme oporavka. Lokalni restic test nije dokaz stvarnog S3 transporta ili dostignutog RPO/RTO. App rollback ne vraća bazu; [Windows recovery](WINDOWS_CLIENT.md) ne produžava plaćeno vreme.
