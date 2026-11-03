# Troubleshooting

Početi od konkretnog release-a, profila, URL-a/porta i `X-Request-Id`/Support ID-a. Ne prilagati tajne ili kompletnu konfiguraciju u incident. Komande su za kasniju dijagnostiku; nisu izvršene tokom dokumentacionog pregleda.

## Pokretanje i baza

| Simptom | Provera i postupak |
| --- | --- |
| Compose traži `DB_PASSWORD`/`JWT_SECRET` | Pripremiti root `.env` sa sopstvenim vrednostima, bez ostavljenih `<...>` placeholder-a |
| Backend container ne startuje i traži secret | Root Compose zahteva ignorisani policy signing private-key fajl; proveriti da je regularan čitljiv fajl, format i mount. [Priprema](../development/LOCAL_SETUP.md#lokalni-policy-signing-ključ) |
| Host backend odbija DB konekciju | Compose MySQL je na 3307; backend default je 3306. Root Compose kreira root nalog, ne backend fallback nalog. Postaviti eksplicitne DB promenljive |
| Access denied posle promene lozinke | MySQL environment važi za inicijalizaciju praznog volume-a; promena `.env` ne menja postojeći DB nalog. Vratiti ispravnu tajnu ili kontrolisano promeniti DB nalog |
| Hibernate missing table / validation error u prod | Prod ne izvršava Flyway. Proveriti migrator rezultat i da SQL checkout odgovara image-u; ne uključivati `ddl-auto=update` |
| Flyway checksum mismatch | Uporediti release i primenjene migracije; ne menjati istoriju naslepo. Korekcija ide novom migracijom ili odobrenim oporavkom |
| Prod context binding greška | Proveriti `CANONICAL_ORIGIN` kao HTTPS origin bez `/` putanje, `APP_RELEASE`, DB/JWT i S3 parametre. [Konfiguracija](../reference/CONFIGURATION.md) |
| Port već zauzet | Ne pokretati host i Compose backend na istom 8080 ili Vite/Compose frontend na istom 5173 |
| Seed zahteva owner | Potreban je postojeći `owner@example.com` sa BCrypt hash-om; proizvoljan `INITIAL_OWNER_EMAIL` nije dovoljan. [Seed](../DEVELOPMENT_SEED.md) |

Lokalni Compose pregled iz korena:

```powershell
docker compose ps
docker compose logs --tail=200 mysql
docker compose logs --tail=200 backend
curl.exe --fail http://localhost:8080/actuator/health/readiness
```

`/healthz` na Nginx-u potvrđuje frontend proces. Backend readiness proverava lifecycle i DB; aggregate `DEGRADED` može biti HTTP 200. Nijedan od njih nije dokaz fizičkog station lock-a.

## Browser i API

| Simptom | Provera i postupak |
| --- | --- |
| Nema naloga / register 403 | Očekivano: javna registracija isključena. Bootstrap OWNER, zatim staff onboarding i customer aktivacija |
| Login uspe, refresh/logout 403 | Proveriti CSRF GET/token/header i cookie; HTTPS/Secure, origin i SameSite politiku. Ne gasiti CSRF |
| CORS/CSP greška | Koristiti isti-origin proxy; proveriti frontend build-time `VITE_API_URL`, backend origin i Nginx CSP. Dodavanje CORS vrednosti samo ne menja CSP |
| 401 posle isteka access tokena | Proveriti refresh cookie/CSRF i opoziv sesije; frontend radi zajednički refresh. Ne prebacivati JWT u URL/localStorage |
| 403 ili redigovani employee podaci | Proveriti permission i konkretan resource grant. Location assignment ili vidljivo UI dugme ne daje pravo izmene |
| 409 | Stale verzija, promenjen termin ili neispravan status/isti idempotency ključ sa drugim telom. Učitati aktuelne podatke i ponovo potvrditi radnju |
| 425 | Isti idempotency zahtev još traje; pratiti `Retry-After`, zadržati isti ključ za istu komandu |
| 429 | Pročitati Retry-After ako postoji; zaustaviti nekontrolisani retry i proveriti rate limit/opterećenje |
| Izveštaj ostaje QUEUED | Proveriti `JOBS_ENABLED`, lease/worker kapacitet, job attempts, storage i vlasništvo zahteva |
| Email ne stiže | U prod profilu podesiti SMTP_HOST/PORT i username/password/from secrets; obavezni STARTTLS, važeći server sertifikat i NOTIFICATION_EMAIL_ENABLED=true. Lokalni adapter ostaje sandbox |
| Document 423 / nedostupna slika | Proveriti scan stanje, worker i storage. Ne menjati ručno u CLEAN bez odgovarajuće provere |
| Upload 413 preko Nginx-a | Proveriti proxy body limit i backend multipart limit; produkcioni Nginx ima `client_max_body_size 6m`. Povećanje samo document limita nije dovoljno |
| Nema SSE osvežavanja | Proveriti bearer header, konekciju i proxy buffering/timeout; stream rute imaju posebnu Nginx konfiguraciju, periodični resync ostaje fallback |
| Star frontend/offline prikaz | Service worker postoji van development režima. Završiti/sačuvati izmene pre aktivacije update-a; proveriti origin storage i da nije prikazan stale-read banner |

## Windows i gaming stanice

| Simptom | Provera i postupak |
| --- | --- |
| Client package nije dostupan | Potreban RELEASED status, numerička verzija, validan SHA-256, signing subject i stvarni HTTPS ZIP URL. Lokalni artifact mount ne zadovoljava remote distribution ugovor |
| Development skripta odbija EXE | Potrebni su novi pripremljeni binarni fajlovi sa `runtime-capabilities.json`; skripta ne radi build. Instalirani production Service blokira dev režim |
| Enrollment ne uspeva | Kod jednokratan/10 min; proveriti TLS, station profil, aktivan identitet i INITIAL/ROTATION svrhu. Ne pokušavati replay potrošenog koda |
| Policy/lease 503 | Backend policy ključ nije konfigurisan/validan. Proveriti Base64 PKCS#8 i Client SPKI public pin/key ID; ne isključivati verifikaciju |
| OFFLINE | Proveriti napajanje, mrežu, DNS, TLS chain, Service i heartbeat. `localhost` sa druge stanice nije server |
| `LOCK_PENDING` / `EXPIRED` | Pregledati station history i command ACK/lease. Force-lock ne znači automatski AVAILABLE; fizičku potvrdu koristiti tek posle stvarne provere |
| `SESSION_RECONCILIATION_REQUIRED` | Maintenance/recovery je prekinuo sesiju; osoblje mora usaglasiti serverovu sesiju kroz autorizovanu operativu |
| AppLocker odbija igru | Profil mora navesti launcher, konkretnu igru i helper/child procese; proveriti trust, dependency group, protected putanju i postojeći GPO/MDM |
| Update/repair neuspeh | Proveriti signer/thumbprint, arhitekturu, manifest, session state i deployment journal. Za offline repair potreban je pouzdan kompletan lokalni paket |
| Maintenance/Service nedostupni | Koristiti zaseban elevated Windows nalog i zaštićene recovery alate iz ProgramData; ne brisati journal/identity pre dijagnostike |

Lokalni bezbedni status i elevated radnje opisani su u [Client vodiču](WINDOWS_CLIENT.md). `support-bundle.ps1` izvozi ograničene metapodatke; ne slati `identity.dpapi`, potpisane session snapshot-e ili sirove customer logove.

## Produkcioni deploy i monitoring

Za preflight, trajne 0440/group-10001 secrets, JSON release istoriju i OWNER bootstrap pratiti [deployment vodič](DEPLOYMENT.md). Ne koristiti volume reset kao popravku produkcije. Backup nalog nema DML prava; proveriti BACKUP_DB_PASSWORD i grant-ove pri prelasku na postojeći volumen. Za storage/DB incident slediti [backup/recovery](BACKUP_RECOVERY.md).

Ako Prometheus target ne radi, uporediti konfigurisan `host.docker.internal:9091` sa stvarnim profilom, management bind adresom i mrežom. Root local profil nema management na 9091; prod Compose ga ne mapira na host. Produkcioni compose.monitoring.yml koristi backend:9091 i frontend blackbox, uz Alertmanager HTTPS webhook/bearer secrets; proveriti stvarni prijem i notifications_failed metriku. Samo definisano pravilo ne dokazuje da operator prima alarm.
