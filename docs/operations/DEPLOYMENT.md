# Docker i produkciono postavljanje

Lokalni [docker-compose.yml](../../docker-compose.yml) i produkcioni [ops/deploy/compose.yml](../../ops/deploy/compose.yml) imaju različitu namenu. Produkcione procedure ispod opisuju postojeće skripte i potrebnu pripremu; statički pregled je našao blokatore, pa ih ne treba tumačiti kao potvrđen deployment bez dodatnog rada administratora. Detaljni nalazi su u [MAINTENANCE_AUDIT.md](../MAINTENANCE_AUDIT.md).

## Topologija

| Stavka | Lokalni root Compose | Produkcioni Compose |
| --- | --- | --- |
| Image-i | Lokalni Dockerfile build | Već objavljeni backend/frontend digest reference |
| Spring | `local`, Flyway pri startu, HTTP cookie | `prod`, Flyway isključen, Secure cookie, HTTPS canonical origin |
| Portovi | Frontend 5173, backend 8080, MySQL 3307 na hostu | Samo frontend na `127.0.0.1:${APP_PORT:-8080}`; spoljašnji HTTPS edge |
| Mreže | Compose mreža | `edge` i interna `data`; management 9091 bez host mapping-a |
| Storage | MySQL/upload named volumes | MySQL i document named volumes; dokumenti default S3 |
| Tajne | Lokalni `.env` i policy key mount | Docker secrets fajlovi i posebno ubrizgana migration lozinka |
| Migracije | Aplikacioni nalog | Odvojeni `migrate` servis i `gmanager_migrator` |

Backend image radi kao UID/GID 10001, frontend kao UID 101. Prod servisi imaju read-only root filesystem, tmpfs, dropped capabilities i `no-new-privileges`. TLS terminator, DNS, certificate issuance i spoljašnje čuvanje podataka nisu uključeni u produkcioni Compose.

## Preduslovi administratora

- Linux/Bash host ili zaštićeni self-hosted runner sa Docker Compose v2, curl i potrebnim pristupom image registry-ju.
- DNS i važeći HTTPS origin; edge prosleđuje na loopback frontend port. Usaglasiti Host i forwarding zaglavlja; trenutni Nginx koristi svoj `$scheme` za `X-Forwarded-Proto`, što iza TLS terminacije može biti HTTP.
- Prazna ili kompatibilna MySQL šema, postojeći volumeni i proveren backup/restore par; isti checkout migracija i backend release.
- Privatni S3 bucket/kredencijali za document storage ili eksplicitno pripremljeno lokalno skladište; snapshot/backup objekata je zasebna obaveza.
- Potpisani Client ZIP već objavljen na HTTPS URL-u, tačan checksum i signer subject. Release workflow prvo proverava taj URL; upload kandidata u GitHub Actions artifact nije automatska objava na tom URL-u.
- Secret fajlovi iz Compose `secrets` sekcije, uključujući JWT, DB username/password/root password, S3, AI, backup encryption i policy signing private key. Kada je adapter isključen, prazan neaktivan secret fajl može zadovoljiti mount, ali obavezne aktivne tajne ne smeju biti prazne.

Backend i backup korisnik moraju moći čitati svoje secret fajlove. Workflow trenutno piše fajlove sa modom 0600, a lokalni Compose file secrets zadržavaju host dozvole: proveriti vlasništvo/ACL za UID 10001 i ne rešavati to javnim pristupom tajnama. Backup output bind direktorijum takođe mora biti upisiv odgovarajućem UID-u.

## Parametri i bootstrap

[.env.example](../../ops/deploy/.env.example) je spisak deployment vrednosti sa placeholder-ima, ne gotov runtime `.env`. [Konfiguracija](../reference/CONFIGURATION.md) razlikuje Spring parametre i Compose parametre. `deploy.sh` očekuje **exportovane environment promenljive**, a ne samo prisutan `.env` fajl; zatim od njih pravi `releases/<APP_RELEASE>.env`.

Obavezni su `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `CANONICAL_ORIGIN`, `APP_RELEASE`, `MIGRATION_DB_PASSWORD`, policy signing key ID i kompletni `GAMING_CLIENT_*` distribucioni podaci. Compose zahteva i `DOCUMENT_S3_BUCKET` čak kada se izabere local storage. Secret `db_username` trenutno mora biti `gmanager`, jer init/backup/restore skripte hardkoduju to ime.

`deploy.sh` serijalizuje sve exportovane `DOCUMENT_*` vrednosti. Ne exportovati S3 access/secret key u roditeljski deploy environment pod tim imenima: koristite deklarisane secret fajlove kako tajne ne bi ušle u release metadata. Postojeća wildcard lista nije bezbedna opšta allow-lista.

Prod Compose **ne prosleđuje** `INITIAL_OWNER_*`. Za novu praznu bazu administrator mora obezbediti kontrolisan bootstrap pre korisničkog rada, npr. privremenim lokalnim Compose override-om koji prosleđuje postojeće Spring promenljive:

```yaml
services:
  backend:
    environment:
      INITIAL_OWNER_EMAIL: ${INITIAL_OWNER_EMAIL:?bootstrap email required}
      INITIAL_OWNER_PASSWORD: ${INITIAL_OWNER_PASSWORD:?bootstrap password required}
      INITIAL_OWNER_NAME: ${INITIAL_OWNER_NAME:-Initial Owner}
```

To je primer sadržaja operatorskog `bootstrap.override.yml`, ne postojeći fajl repozitorijuma. Lozinku ubrizgati iz secret manager-a. Ako ga koristite sa postojećom Bash deploy skriptom, `COMPOSE_FILE=compose.yml:bootstrap.override.yml` se tumači iz `ops/deploy/`; uključiti ga dosledno u sve deployment korake. Posle uspešnog kreiranja naloga ukloniti bootstrap environment/override i recreate backend. Provisioner ne menja postojeći nalog. Nema javne registracije ili automatskog OWNER naloga bez ove pripreme.

## Poznati blokatori pre pokretanja

1. Compose traži `${BACKUP_FILE:?}` u restore-drill definiciji pre nego što `deploy.sh` stigne da napravi backup. I neaktivni profili učestvuju u interpolaciji. Privremena vrednost može zadovoljiti parsiranje pri prvom koraku; skripta kasnije postavlja stvarnu putanju tek napravljenog backup-a. Ne pokretati restore sa privremenom putanjom.
2. `restore-backend` koristi `SPRING_PROFILES_ACTIVE=prod`, ali ne prosleđuje `GAMING_CLIENT_*`; default `GAMING_CLIENT_DOWNLOAD_URL` je relativan. Proveriti startup/health i uslove drugih default podešavanja tog servisa; to nije puna verifikacija document storage-a ili Client distribucije.
3. Privilegije korisnika i `mysqldump` opcije, dozvole secret/output fajlova i mrežna ruta do S3 zahtevaju realnu proveru. `data` mreža je interna; dostupnost spoljašnjih zavisnosti treba proveriti iz servisa koji ih koristi.
4. `rollback.sh` koristi Bash `source` nad release fajlom napravljenim sirovim `env` izlazom. Vrednost sa razmacima, posebno signing subject, nije shell-quoted i može prekinuti rollback. Pre oslanjanja na skriptu rešiti format ili pripremiti kontrolisan rollback prema proverenim image digest-ima.
5. Deploy/rollback/smoke `.sh` fajlovi u Git index-u imaju mode **100644**, dok release workflow i međusobni pozivi koriste direktno izvršavanje. Linux checkout zahteva pripremu executable bit-a; u suprotnom se očekuje permission denied pre same procedure.

Ovi nedostaci nisu popravljani u aplikacionom/deployment kodu u okviru dokumentacionog zadatka.

## Postojeći deploy tok i komande

Nakon što administrator obezbedi konfiguraciju, tajne i otkloni primenljive blokatore, komande iz korena su:

```bash
# Priprema Linux checkout-a; radi se pre direktnih poziva skripti.
chmod +x ops/deploy/deploy.sh ops/deploy/rollback.sh ops/deploy/smoke.sh
# Samo za početno parsiranje; deploy.sh kasnije bira stvarni backup.
export BACKUP_FILE=/backup/output/pending.sql.gz.enc
./ops/deploy/deploy.sh
```

Ostale obavezne promenljive moraju već biti exportovane iz zaštićenog runner-a/environment-a. Ne koristiti `source` nad proizvoljnim `.env` primerom sa nequoted vrednostima.

Skripta:

1. Proverava osnovne promenljive i digest oblik; upisuje candidate release konfiguraciju bez migration lozinke.
2. Preuzima backend/frontend/MySQL i podiže MySQL.
3. Za postojeći release pravi backup, restore-drill i restored-backend readiness pre migracije.
4. Pokreće Flyway `validate/migrate/info`; za prvi release tek potom pravi početni backup i restore-drill.
5. Podiže backend/frontend i pokreće `smoke.sh` prema HTTPS origin-u.
6. Tek nakon uspeha rotira `current.env` u `previous.env` i candidate u `current.env`.

Prvi restore-drill nije dokaz oporavka sa prethodnog release-a, jer tada prethodni podaci ne postoje. `smoke.sh` proverava `/healthz`, SPA naslov, HSTS/CSP i odbijen neautentifikovani katalog; ne proverava login, kompletan poslovni tok ili fizičku stanicu.

Za pregled servisa, iz `ops/deploy/`, uz pripremljen environment/secrets i postojeći release fajl:

```bash
docker compose --env-file releases/current.env ps
docker compose --env-file releases/current.env logs --tail=200 backend
docker compose --env-file releases/current.env exec -T backend curl --fail --silent http://127.0.0.1:9091/actuator/health/readiness
```

Compose i dalje zahteva `MIGRATION_DB_PASSWORD`, `BACKUP_FILE` i deklarisane secret fajlove pri radu sa modelom. Sačuvati pristup secret manager-u za recreate/recovery; workflow na kraju briše materijalizovane tajne sa runner-a.

## Release i rollback

[release.yml](../../.github/workflows/release.yml) prihvata `v<major.minor.patch[.revision]>` tag ili ručni numeric version dispatch. Windows job pravi potpisani kandidat, image job objavljuje SBOM/provenance i digests, a deploy job koristi zaštićeno okruženje i runner oznaku `gmanager-deploy`. Staging dodatno radi rollback rehearsal/redeploy, k6 i ZAP baseline. Workflow nema direktan gate na uspešan CI rezultat za isti commit; to mora biti uređeno procesom/repository pravilima.

Postojeća komanda za rollback, nakon pripreme i provere ograničenja release fajla:

```bash
./ops/deploy/rollback.sh
```

Vraća prethodni backend/frontend image par, pokreće smoke i menja `current.env`; **ne vraća bazu ni objekte**. Ne pretpostavljati automatski rollback posle neuspeha `deploy.sh`. Ako nova šema nije kompatibilna sa starim image-om, koristiti provereni restore/roll-forward plan iz [backup vodiča](BACKUP_RECOVERY.md).

## Observability i završna provera

Readiness zavisi od lifecycle-a i DB-a. Aggregate health može biti `DEGRADED` uz HTTP 200 zbog station/job stanja, dok readiness ostaje UP za oporavak. Readiness nije potvrda da je stanica bezbedna za novu sesiju.

[Observability override](../../docker-compose.observability.yml) daje Prometheus/Grafana za lokalnu dijagnostiku, ali Prometheus target je `host.docker.internal:9091`. Root local backend sluša 8080, a produkcioni management port nije mapiran na host; override zato nije gotova monitoring konfiguracija za oba režima. Prilagoditi privatni target/mrežu i Grafana tajnu. Alertmanager i dostava alarma nisu uključeni. [Runbook](../../ops/runbooks/observability.txt) je pomoć za dijagnostiku, a [troubleshooting](TROUBLESHOOTING.md) daje konkretne početne provere.
