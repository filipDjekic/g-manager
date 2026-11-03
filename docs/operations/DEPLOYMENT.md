# Production deployment

FAZA 4 povezuje CI, potpisivanje i objavljivanje Windows paketa, server deployment, automatski backup i monitoring. Produkcionu spremnost potvrđuju stvarni staging deployment, restore i fizički Windows pilot.

## Priprema

Namenski Linux self-hosted runner: oznaka `gmanager-deploy`, Docker/Compose v2, Bash, Python 3, curl, flock, GitHub CLI i registry pristup. Ne koristiti ga za nepouzdane PR poslove. Obezbediti DNS, firewall, HTTPS i prostor za persistent volumes.

`DEPLOY_SECRETS_DIR`, `DEPLOY_STATE_DIR` i `CLIENT_RELEASES_DIR` su apsolutni trajni direktorijumi VAN checkout-a. Primer administratorske pripreme, uz zamenu RUNNER_USER:

```bash
sudo groupadd --gid 10001 gmanager-runtime # samo ako grupa ne postoji
sudo usermod -aG gmanager-runtime RUNNER_USER
sudo install -d -m 0700 -o RUNNER_USER /var/lib/gmanager/secrets /var/lib/gmanager/state
sudo install -d -m 0755 -o RUNNER_USER /var/lib/gmanager/client-releases
```

Obnoviti runner sesiju posle promene grupa. Provisioning piše 0440 secret fajlove grupe 10001. Backend/backup UID 10001 i monitoring dodatna grupa ih čitaju; ne koristiti javne dozvole. Izmena postojećih DB/JWT/policy/backup/restic tajni se odbija: rotacija zahteva kontrolisan poseban postupak i očuvanje pristupa starim kopijama.

Named volumes čuvaju MySQL, dokumente, backup i monitoring. Ne izvršavati `down -v`. MySQL i Actuator nisu mapirani na host. Frontend sluša na loopback-u; Caddy obezbeđuje HTTPS preko 80/443. `ENABLE_TLS=false` koristi se samo uz pripremljen spoljašnji HTTPS proxy. Interni backup API nije javno rutiran.

## GitHub konfiguracija

Napraviti environments `client-signing`, `staging`, `production`: required reviewers, prevent self-review, ograničene dozvoljene grane/tagovi; isključiti administratorsko zaobilaženje. Release proverava reviewers/ref zaštitu preko read-only GitHub API-ja i prekida ako je ne može potvrditi. Ne podešava automatski GitHub nalog. Proveriti podršku vašeg plana za private repository protection: [GitHub uputstvo](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Uključiti required checks iz `.github/branch-protection.json`. Release poziva ceo reusable CI za isti commit i zahteva istoriju default grane.

| Environment secrets | Imena, bez vrednosti |
| --- | --- |
| client-signing | GAMING_CLIENT_SIGNING_PFX_BASE64, GAMING_CLIENT_SIGNING_PFX_PASSWORD |
| staging/production, obavezno | JWT_SECRET, DB_USERNAME, DB_PASSWORD, DB_ROOT_PASSWORD, BACKUP_DB_PASSWORD, MIGRATION_DB_PASSWORD, RESTORE_VERIFIER_PASSWORD, BACKUP_ENCRYPTION_KEY, BACKUP_COORDINATION_KEY, RESTIC_PASSWORD, RESTIC_ACCESS_KEY_ID, RESTIC_SECRET_ACCESS_KEY, STATION_POLICY_SIGNING_PRIVATE_KEY |
| Prvi OWNER | INITIAL_OWNER_PASSWORD |
| Monitoring | ALERT_WEBHOOK_URL, ALERT_WEBHOOK_TOKEN, GRAFANA_ADMIN_PASSWORD |
| S3 document storage | DOCUMENT_S3_ACCESS_KEY, DOCUMENT_S3_SECRET_KEY |
| SMTP kada se koristi | SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM |
| HTTP AI kada se koristi | AI_API_KEY |
| Staging k6 | SMOKE_CUSTOMER_EMAIL, SMOKE_CUSTOMER_PASSWORD, SMOKE_MANAGER_EMAIL, SMOKE_MANAGER_PASSWORD |

JWT, backup encryption, restic i coordination tajne: najmanje 32 bajta; coordination koristi 32–256 URL-safe karaktera A–Z/a–z/0–9/_/-. Backup koristi poseban off-site repository i posebne storage kredencijale.

| Environment variables | Imena |
| --- | --- |
| Obavezno | CANONICAL_ORIGIN, DEPLOY_SECRETS_DIR, DEPLOY_STATE_DIR, CLIENT_RELEASES_DIR, STATION_POLICY_SIGNING_PUBLIC_KEY, STATION_POLICY_SIGNING_KEY_ID, GAMING_CLIENT_MINIMUM_VERSION, RESTIC_REPOSITORY |
| Prvi OWNER | INITIAL_OWNER_EMAIL, INITIAL_OWNER_NAME |
| Storage | DOCUMENT_STORAGE_BACKEND=local\|s3, DOCUMENT_S3_ENDPOINT, DOCUMENT_S3_REGION, DOCUMENT_S3_BUCKET |
| Backup | BACKUP_INTERVAL_SECONDS=86400, BACKUP_RETENTION_DAYS=30, BACKUP_RESTORE_INTERVAL=7 |
| Edge/monitoring | ENABLE_TLS=true, ENABLE_MONITORING=true |
| SMTP | SMTP_HOST, SMTP_PORT=587, NOTIFICATION_EMAIL_ENABLED=false |
| AI | AI_PROVIDER=disabled\|http, AI_ENDPOINT, AI_MODEL |

Image digests, Client version/SHA/publisher pins i versioned download URL potiču iz istog workflow run-a. Produkcija zahteva `RESTIC_REPOSITORY=s3:https://HOST/DEDICATED-BUCKET/PREFIX`, bez kredencijala u URL-u. Repository inicijalizovati jednom prema [backup vodiču](BACKUP_RECOVERY.md).

Policy privatni ključ je Ed25519 PKCS8 base64, javni odgovarajući SPKI base64; prod start proverava par. Code-signing sertifikat je zaseban pouzdan sertifikat, samo na signing runner-u. Nema generisanja lažnih produkcionih sertifikata.

## Povezani release tok

1. Reusable CI build/test/security i environment policy provera.
2. Windows build, Authenticode/CMS/SHA i ponovno Assert-Package proveravanje. Artifact sadrži samo ZIP, javni manifest i checksum.
3. Backend/frontend image build, SBOM/provenance, Trivy i immutable digests.
4. Odobreni runner preuzima artifact istog run-a i atomski objavljuje verziju u CLIENT_RELEASES_DIR/VERSION.
5. Trajni secret provisioning, javni JSON/preflight/Compose validation.
6. Zaustavljanje scheduler-a, backup postojeće baze, izolovani restore, migracija obnovljene šeme i probni backend; zatim poslovna Flyway migracija. Kod prve instalacije backup/restore sledi prvu migraciju.
7. Start ClamAV/backend/frontend/TLS/scheduler/monitoring, readiness, smoke i stvarno HTTPS preuzimanje ZIP-a sa tačnim SHA.
8. Novi backend izvršava koordinisani DB/document/off-site ciklus; zatim se scheduler ponovo pokreće. Tek posle uspeha rotiraju se current.json i previous.json u DEPLOY_STATE_DIR.
9. Staging radi rollback/redeploy ako postoji prethodno izdanje, k6 i ZAP. Prvi staging release nema dokaz rollback-a.

Skripte se pozivaju sa `bash`, nezavisno od executable bita. JSON koristi eksplicitnu javnu listu; nema `source`, wildcard secrets ili gubitka razmaka u signing subject-u.

Prvi release zahteva OWNER email/password secret. Postojeći OWNER se ne menja; drugi bootstrap OWNER se ne kreira. Prva prijava zahteva promenu lozinke.

MySQL init daje runtime korisniku DML, migratoru DDL, posebnom gmanager_backup nalogu dump privilegije bez INSERT/UPDATE/DELETE prava, a restore korisniku prava samo nad `gmanager_restore_drill_scheduled`. Za postojeći volumen administrator mora kontrolisano proveriti/primeniti grant-ove iz mysql-init.sh: init se automatski izvršava samo na novoj bazi. Posle promene grant-ova obnoviti aplikacione konekcije kroz kontrolisani restart/recreate backenda, jer MySQL postojeće sesije mogu zadržati prethodne privilegije.

## Komande

Uz proverene javne parametre i tajne ubrizgane iz secret manager-a:

```bash
python3 ops/deploy/provision_secrets.py
python3 ops/deploy/release_config.py write "$DEPLOY_STATE_DIR/candidate.json"
bash ops/deploy/preflight.sh "$DEPLOY_STATE_DIR/candidate.json"
bash ops/deploy/deploy.sh
python3 ops/deploy/release_config.py compose "$DEPLOY_STATE_DIR/current.json" ps
python3 ops/deploy/release_config.py compose "$DEPLOY_STATE_DIR/current.json" logs --tail=100 backend
bash ops/deploy/rollback.sh
```

Rollback vraća aplikacione image-e, ne bazu/objekte. Potvrditi kompatibilnost prethodnog image-a sa novom šemom pre odobravanja migracije. Neuspešan deploy ne označava kandidat uspešnim i ne izvršava slepi DB rollback. Ako je postupak prekinut pre nastavka scheduler-a, nakon razrešenja ponovo ga pokrenuti sa važećim release JSON-om i potvrditi novi backup/status.

Stari `releases/current.env` nikad ne source-ovati. Sačuvati ga kao podatke, uneti proverene javne vrednosti i nove obavezne parametre u zaštićeni environment, zatim `release_config.py write "$DEPLOY_STATE_DIR/current.json"`. Ručno potvrditi aktivne image digests. Deploy odbija legacy stanje bez ovog koraka. Sačuvati postojeće volumes/secrets.

## Monitoring i acceptance

Produkcioni Prometheus čita backend:9091 i frontend blackbox. Alertmanager šalje HTTPS webhook JSON sa bearer secret-om; prijemnik mora podržavati taj format. Grafana koristi secret password. Portovi 9090/9093/3001 su loopback; koristiti SSH tunnel. SMTP je zaseban aplikacioni kanal sa obaveznim STARTTLS/server identity proverom. Prod koristi stvarni ClamAV, bez test-signature adaptera.

Pre kupaca: pravo potpisivanje/timestamp i trust, DNS/TLS/tačan ZIP, OWNER/promenjena lozinka, EICAR i document download, SMTP ako je uključen, prijem alarma, off-site restore, rollback i rollout jedne pa sledeće stanice. [Windows](WINDOWS_CLIENT.md), [backup](BACKUP_RECOVERY.md), [pilot](GAMING_CLIENT_PRODUCTION_ROLLOUT.md), [troubleshooting](TROUBLESHOOTING.md).
