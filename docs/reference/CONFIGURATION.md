# Konfiguracija okruženja

Izvori su [application.yml](../../gm/src/main/resources/application.yml), [local](../../gm/src/main/resources/application-local.yml), [prod](../../gm/src/main/resources/application-prod.yml), [root Compose](../../docker-compose.yml), [produkcioni Compose](../../ops/deploy/compose.yml) i [entrypoint](../../gm/ops/container-entrypoint.sh). Ovde su nazivi i podrazumevane vrednosti iz koda; stvarne tajne nisu deo dokumentacije.

## Načini učitavanja

| Okruženje | Učitavanje i važni izuzeci |
| --- | --- |
| `local` na hostu | Podrazumevani Spring profil; uvozi `.env` i `../.env` kao properties; Flyway uključen; cookie nije Secure |
| Root Compose | `.env` služi Compose interpolaciji; samo eksplicitni `environment`/mount ulazi u kontejner; koristi `local` profil |
| `test` | Izolovana H2 baza, testni storage i JWT iz `application-test.yml`; outbox/jobs su default isključeni |
| `prod` | Nema Spring `.env` importa; obavezni DB podaci, HTTPS origin, release i JWT; Secure cookie fiksiran na true; Flyway isključen; OpenAPI isključen |
| Vite | `frontend/g-manager/.env`, ne root `.env`; `VITE_*` ulazi u javni bundle pri build-u |
| Instalirani Client | ACL-zaštićen `%ProgramData%\GManager\Client\client.json`; environment/CLI ne nadjačavaju produkcionu konfiguraciju |

## Osnovni backend parametri

| Promenljiva | Default / zahtev | Napomena |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | Default profil `local`; Docker image postavlja `prod`, root Compose ga nadjačava | Produkciju eksplicitno pokretati kao `prod` |
| `DB_URL` | Host default MySQL `localhost:3306/gmanager`; prod obavezan | Host + root Compose MySQL zahteva port 3307; mrežni naziv servisa je `mysql:3306` |
| `DB_USERNAME`, `DB_PASSWORD` | Backend ima development fallback; prod obavezni | Root Compose kreira root nalog, ne backend fallback nalog; ne oslanjati se na ugrađene kredencijale |
| `JWT_SECRET` | Obavezan; najmanje 32 znaka u properties validaciji i najmanje 32 UTF-8 bajta za JWT ključ | Koristiti najmanje 32 nasumična ASCII znaka; nije Base64-dekodiran JWT secret |
| `INITIAL_OWNER_EMAIL`, `INITIAL_OWNER_PASSWORD` | Prazno: bootstrap isključen | Zajedno; lozinka ≥8; postojeći email se ne menja |
| `INITIAL_OWNER_NAME` | `Initial Owner` | Ne sme biti prazno pri bootstrap-u |
| `BUSINESS_TIME_ZONE` | `Europe/Belgrade` | IANA zona, ne fiksni UTC offset |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | U prod profilu vrednost dolazi iz `CANONICAL_ORIGIN`; root Compose ima sopstvenu fiksnu development listu |
| `COOKIE_SECURE` | Osnovni YAML true | `local` fiksira false, `prod` true; promenljiva sama ne menja profile override |
| `UPLOAD_ROOT` | `data/uploads` | Relativno prema working directory-ju; Compose mount koristi `/data/uploads` |
| `CANCELLATION_CUTOFF_MINUTES` | 60 | CUSTOMER otkazivanje potvrđene rezervacije; naziv nije `RESERVATION_CANCELLATION_CUTOFF_MINUTES` |

Access token traje 15 minuta, refresh token 14 dana prema `app.jwt` YAML vrednostima. `app.idempotency` definiše TTL 24h, timeout obrade 120s i cleanup cron `0 0 3 * * *`. Ova podešavanja nemaju zasebne `${...}` alias-e u YAML-u; menjaju se Spring konfiguracijom.

Customer aktivacioni kod uvek važi tačno jedan sat. `CUSTOMER_ACTIVATION_TTL_HOURS` je uklonjen. Kodovi i ključevi deljenog SQL limitera koriste HMAC-SHA-256 sa odvojenim domenima i postojećim `JWT_SECRET`; sve instance moraju imati isti ključ. Rotacija ključa poništava izdate kodove. Za limite, čišćenje i prelaz sa starih kodova videti [ugovor aktivacije](../contracts/CUSTOMER_ONBOARDING.md).

## Produkcija i secrets

| Parametar | Namena |
| --- | --- |
| `CANONICAL_ORIGIN` | HTTPS origin bez putanje, query-ja, fragmenta ili završne `/`; validira `ProductionProperties` |
| `APP_RELEASE` | Neprazan identifikator izdanja; release workflow koristi commit SHA |
| `TRUSTED_PROXY_REGEX` | Tomcat allow-list pouzdanih proxy adresa; default pokriva privatne opsege, suziti prema infrastrukturi |
| `MANAGEMENT_SERVER_PORT`, `MANAGEMENT_SERVER_ADDRESS` | Prod default 9091 / 127.0.0.1; deploy Compose otvara na internoj mreži sa adresom 0.0.0.0, bez host port mapping-a |
| `DB_POOL_MAX_SIZE`, `DB_POOL_MIN_IDLE` | 20 / 5 |
| `DB_CONNECTION_TIMEOUT_MS`, `DB_VALIDATION_TIMEOUT_MS` | 3000 / 2000 |
| `DB_MAX_LIFETIME_MS` | 1800000 |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE` | Produkcioni image reference; deploy skripta zahteva `@sha256:` digest |
| `DEPLOY_ENV`, `APP_PORT` | Compose project okruženje, default staging; loopback frontend port, default 8080 |
| `MIGRATION_DB_PASSWORD` | Tajna odvojenog `gmanager_migrator` korisnika; ubrizgava se u proces, ne release `.env` |
| `BACKUP_FILE` | Container putanja izabranog `.sql.gz.enc`; Compose je trenutno zahteva i pre operations pokretanja, videti [deployment](../operations/DEPLOYMENT.md) |
| `BACKUP_RETENTION_DAYS` | 30, za DB backup fajlove |

Container entrypoint učitava `JWT_SECRET`, `DB_USERNAME`, `DB_PASSWORD` i `STATION_POLICY_SIGNING_PRIVATE_KEY` iz postojećeg environment-a ili odgovarajućeg `*_FILE`. Podrazumevani secret fajlovi su `/run/secrets/jwt_secret`, `db_username`, `db_password`, `station_policy_signing_private_key`. Takođe zahteva `DB_URL`, `CANONICAL_ORIGIN`, `APP_RELEASE`, čak i kada se image koristi sa `local` profilom.

Za S3 dodatno učitava `DOCUMENT_S3_ACCESS_KEY[_FILE]`, `DOCUMENT_S3_SECRET_KEY[_FILE]`; za HTTP AI `AI_API_KEY[_FILE]`. Sufiks `_FILE` je podrška shell entrypoint-a, nije automatsko čitanje u Spring-u pri Maven startu. Produkcioni Compose deklarativno traži sve navedene secret fajlove, uključujući S3/AI fajlove i kada adapter nije uključen. Proveriti čitljivost za container UID 10001.

## Storage, notifikacije i obrada

| Oblast | Promenljive i default vrednosti |
| --- | --- |
| Documents | `DOCUMENT_STORAGE_BACKEND=local`, `DOCUMENT_MAX_FILE_BYTES=5242880`, `DOCUMENT_MAX_FILES_PER_RESOURCE=20`, `DOCUMENT_DELETE_RETENTION_DAYS=30` |
| S3 | `DOCUMENT_S3_ENDPOINT` opcion, `DOCUMENT_S3_REGION=us-east-1`, `DOCUMENT_S3_BUCKET`, `DOCUMENT_S3_ACCESS_KEY`, `DOCUMENT_S3_SECRET_KEY`; S3 zahteva region/bucket/kredencijale; deploy Compose defaultuje na local; S3 zahteva bucket kada je uključen |
| Upload HTTP limit | `spring.servlet.multipart.max-file-size` i `max-request-size` su oba 5MB; promena samo document limita ne povećava ovaj limit niti Nginx limit |
| Outbox | `OUTBOX_ENABLED=true`, `OUTBOX_BATCH_SIZE=50`, `OUTBOX_POLL_INTERVAL_MILLIS=1000`, `OUTBOX_LEASE_SECONDS=60`, `OUTBOX_MAX_ATTEMPTS=5`, `OUTBOX_INITIAL_BACKOFF_SECONDS=5`, `OUTBOX_RETENTION_DAYS=30` |
| Jobs | `JOBS_ENABLED=true`, `JOBS_WORKER_COUNT=4`, `JOBS_QUEUE_CAPACITY=20`, `JOBS_CLAIM_BATCH_SIZE=4`, `JOBS_POLL_INTERVAL_MILLIS=1000`, `JOBS_LEASE_SECONDS=60`, `JOBS_TIMEOUT_SECONDS=300`, `JOBS_MAX_ATTEMPTS=5`, `JOBS_INITIAL_BACKOFF_SECONDS=10`, `JOBS_SHUTDOWN_WAIT_SECONDS=30` |
| Retention | `REFRESH_TOKEN_RETENTION_DAYS=30`, `AUDIT_RETENTION_DAYS=365` |
| Notifications | `NOTIFICATION_EMAIL_ENABLED=false`, `NOTIFICATION_DELIVERY_BATCH_SIZE=25`, `NOTIFICATION_MAX_DELIVERY_ATTEMPTS=5`, `NOTIFICATION_INITIAL_BACKOFF_SECONDS=10`, `NOTIFICATION_RETENTION_DAYS=90`, `NOTIFICATION_SSE_TIMEOUT_SECONDS=1800` |

U prod profilu email flag uključuje stvarni SMTP adapter (SMTP_HOST/PORT/USERNAME/PASSWORD/FROM, obavezni STARTTLS i server identity). Van prod profila adapter ostaje sandbox. Produkcioni Compose ne prosleđuje svaku opcionu promenljivu iz ove tabele; za odstupanje od default-a potreban je eksplicitan deployment environment/override.

## Gaming i Client distribucija

| Oblast | Promenljive i default vrednosti |
| --- | --- |
| Trajanje rezervacije | `GAMING_SESSION_MINIMUM_DURATION_MINUTES=15`, `GAMING_SESSION_MAXIMUM_DURATION_MINUTES=480`; ne određuju trajanje kupljenog gaming vremena |
| Vremenski račun | `GAMING_TIME_ACCOUNTING_MILLIS=10000`, `GAMING_LOGIN_TIMEOUT_SECONDS=300`; dopuna je najmanje 30 celih minuta, bez isteka |
| Heartbeat / poslovi | `GAMING_SESSION_HEARTBEAT_INTERVAL_SECONDS=10`, `GAMING_SESSION_OFFLINE_GRACE_SECONDS=60`, `GAMING_SESSION_WARNING_THRESHOLD_MINUTES=15,5,1`, `GAMING_SESSION_EXPIRATION_SCHEDULE_MILLIS=10000`, `GAMING_SESSION_RECONCILIATION_INITIAL_DELAY_MILLIS=30000`, `GAMING_SESSION_RECONCILIATION_SCHEDULE_MILLIS=300000`, `GAMING_SESSION_COMMAND_RETENTION_DAYS=30` |
| Policy/lease | `STATION_POLICY_SIGNING_PRIVATE_KEY` (Base64 PKCS#8 DER), `STATION_POLICY_SIGNING_KEY_ID`; `STATION_LEASE_DURATION_SECONDS=30`, `STATION_OFFLINE_GRACE_SECONDS=30` |
| Machine observability | `STATION_COMMAND_LAG_WARNING_SECONDS=60`, `STATION_METRICS_REFRESH_MILLIS=15000`, `STATION_NONCE_RETENTION_DAYS=7`, `STATION_HEARTBEAT_RETENTION_DAYS=30`, `STATION_AUDIT_RETENTION_DAYS=90`, `STATION_RETENTION_CLEANUP_CRON=0 20 3 * * *` |
| Distribucija | `GAMING_CLIENT_VERSION=0.1.0-dev`, `GAMING_CLIENT_STATUS=DEVELOPMENT`, `GAMING_CLIENT_DOWNLOAD_URL=/downloads/gmanager-client/GManager.Client.zip`, `GAMING_CLIENT_SHA256=UNPUBLISHED`, `GAMING_CLIENT_MINIMUM_VERSION=0.1.0`, `GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT=UNPUBLISHED` |

Za stvarnu distribuciju podesiti `RELEASED`, numeričku verziju, HTTPS URL, pravi SHA-256 i signer subject. Root Compose pin-uje lokalni signing key ID; prod Compose zahteva svoj. Heartbeat offline grace i potpisani lease grace su različita podešavanja i ne treba ih poistovećivati.

## Feature flags i AI

`FEATURE_REPORTS_ENABLED=true`, `FEATURE_PWA_OFFLINE_ENABLED=true`, `FEATURE_AI_ASSISTANT_ENABLED=false` su početne vrednosti. Aktivni DB overrides sa rollout procentom i istekom imaju prednost; ovo nije permission mehanizam.

`PWA_OFFLINE` je definisan i vraća se u bootstrap-u, ali trenutni service-worker registration i API offline cache kod ne proveravaju njegovu vrednost. Ne koristiti taj flag kao potvrđen način gašenja offline skladištenja. REPORTS i AI imaju zasebne implementirane provere.

`AI_PROVIDER=disabled`, `AI_ENDPOINT` i `AI_API_KEY` su prazni, `AI_MODEL=not-configured`. HTTP provider zahteva odgovarajuću konfiguraciju i posebno uključen `AI_ASSISTANT`. Limiti: `AI_TIMEOUT_MILLIS=3000`, `AI_MAX_INPUT_TOKENS=200`, `AI_MAX_OUTPUT_TOKENS=300`, `AI_DAILY_TOKEN_LIMIT=10000`, `AI_CIRCUIT_FAILURE_THRESHOLD=3`, `AI_CIRCUIT_OPEN_SECONDS=60`, `AI_METADATA_RETENTION_DAYS=90`, `AI_CLEANUP_CRON=0 30 3 * * *`.

Frontend koristi `VITE_API_URL` (default `/api/v1`) i `VITE_RELEASE` za release oznaku. Dockerfile fiksira isti-origin API putanju pri build-u. Promena runtime container environment-a ne menja već izgrađeni JS. Odvojeni API origin zahteva usklađivanje CORS, CSP `connect-src`, cookie i frontend build konfiguracije; isporučeni Nginx je predviđen za isti origin.

## Produkcioni runtime — FAZA 4

Trajni host direktorijumi, kompletni GitHub secrets/variables i bootstrap opisani su u [DEPLOYMENT.md](../operations/DEPLOYMENT.md); ne čuvati tajne u javnom JSON-u. Dodatni trust parametri su GAMING_CLIENT_PACKAGE_SIGNING_THUMBPRINT i STATION_POLICY_SIGNING_PUBLIC_KEY. BACKUP_STATUS_FILE je zaštićen status scheduler-a, BACKUP_COORDINATION_KEY_FILE interna koordinaciona tajna; BACKUP_INTERVAL_SECONDS/RETENTION_DAYS/RESTORE_INTERVAL podešavaju ciklus i alarme. Prod zahteva app.documents.scanner=clamav, sa CLAMAV_HOST/PORT; transportni scan ERROR ostaje u karantinu i ponavlja se posle minutnog backoff-a. Nema automatskog odobravanja fajla zbog scanner outage-a.
