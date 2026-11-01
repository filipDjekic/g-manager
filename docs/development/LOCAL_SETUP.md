# Lokalno razvojno okruženje

Za početno pokretanje koristite [README Quick Start](../../README.md#quick-start-backend-i-frontend-na-hostu). Ovde su objašnjeni izbori i dodatni koraci. Sve komande su uputstva; u dokumentacionom pregledu nisu izvršavane.

## Alati i dva režima rada

| Režim | Na hostu | U Docker-u |
| --- | --- | --- |
| Razvoj sa hot reload-om | JDK 21, Maven Wrapper backend, Node/npm, Vite | Samo MySQL 8.4; opciono nijedan kontejner ako MySQL već postoji |
| Lokalni Compose stack | Docker Engine/Desktop i Compose v2 | MySQL, backend i frontend Nginx; nema Vite hot reload-a |

Za frontend pratiti `engines` i `packageManager` u [package.json](../../frontend/g-manager/package.json). CI koristi Node 22.23.3/npm 11.19.1. Java je 21; Maven se preuzima kroz `gm/mvnw` ili `gm/mvnw.cmd`. Preuzimanje dependencies zahteva pristup odgovarajućim registrima.

## Backend konfiguracija

Napravite root `.env` prema README-u, bez navodnika oko placeholder-a nakon zamene. [application-local.yml](../../gm/src/main/resources/application-local.yml) uvozi `.env` iz working directory-ja i njegovog roditelja kao Java properties. Pokretanje iz `gm/` ili korena zato nalazi root fajl. Prod profil to ne radi. Vrednosti iz environment-a procesa mogu nadjačati konfiguraciju.

Kod host backend-a i Compose MySQL-a koristite `DB_URL` sa `localhost:3307` i `DB_USERNAME=root`. Compose ne kreira ugrađeni backend default nalog. U celom Compose stack-u backend dobija `mysql:3306` i svoje promenljive kroz `environment` blok; promenljiva iz root `.env` se ne prosleđuje automatski kontejneru ako nije navedena u tom bloku.

`INITIAL_OWNER_EMAIL` i `INITIAL_OWNER_PASSWORD` zajedno uključuju bootstrap. Lozinka ima najmanje 8 znakova; ime nije prazno. Provisioner kreira OWNER samo ako email još ne postoji. Promena bootstrap lozinke kasnije ne menja postojeći nalog. Bez bootstrap-a ili postojećeg naloga nema javnog signup puta: `/auth/register` vraća 403.

Lokalni profil postavlja `secure-cookie: false`. Samo postavljanje `COOKIE_SECURE` u root fajlu ne menja ovu profile vrednost; za lokalni HTTPS eksperiment koristite eksplicitno Spring podešavanje, a za produkciju profil `prod`. Pregled svih razlika je u [konfiguraciji](../reference/CONFIGURATION.md).

## Pokretanje na hostu

Iz korena, nakon pripreme `.env`:

```powershell
docker compose up -d mysql
Set-Location gm
.\mvnw.cmd spring-boot:run
```

Flyway pri startu migrira bazu, a Hibernate validira šemu. U drugom terminalu iz korena:

```powershell
Set-Location frontend/g-manager
npm ci
npm run dev
```

Frontend `.env` je opcion; [primer](../../frontend/g-manager/.env.example) koristi `/api/v1`. Vite proxy je eksplicitno usmeren na `http://localhost:8080` za `/api` i `/media`. Promena backend porta zahteva i odgovarajuće proxy podešavanje u razvojnom okruženju. Ne pokretati host backend i Compose backend istovremeno na 8080, niti Vite i Compose frontend na 5173.

Za sopstveni MySQL napravite praznu bazu i development nalog sa DDL/DML pravima potrebnim Flyway-u, pa postavite `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`. Ne koristiti testni H2 kao razvojnu ili produkcionu bazu.

## Lokalni policy signing ključ

Host backend može pokrenuti obične web funkcije bez policy signing ključa, ali potpisivanje policy-ja i lease-a tada vraća 503. Kontejnerski entrypoint zahteva ključ i pre starta JVM-a. Root Compose očekuje ignorisani fajl `gm/config/local/station-policy-signing-private-key.base64`, sa Base64 **PKCS#8 DER Ed25519** privatnim ključem.

Ako takav lokalni par još nemate, sledeće komande koriste instalirani OpenSSL i PowerShell, iz korena repozitorijuma. Ne prepisivati postojeći par kojim su već pinovani Client-i. Komande generišu novi development par; njegov javni ključ neće odgovarati postojećem javnom ključu iz checkout-a.

```powershell
if (Test-Path -LiteralPath gm/config/local/station-policy-signing-private-key.base64) {
    throw 'Lokalni policy ključ već postoji; sačuvajte postojeći par.'
}
openssl genpkey -algorithm ED25519 -outform DER -out gm/config/local/policy-development.key
if ($LASTEXITCODE -ne 0) { throw 'Generisanje ključa nije uspelo.' }
openssl pkey -inform DER -in gm/config/local/policy-development.key -pubout -outform DER -out gm/config/local/policy-development-public.key
if ($LASTEXITCODE -ne 0) { throw 'Izvoz javnog ključa nije uspeo.' }
[IO.File]::WriteAllText(
    (Join-Path (Get-Location) 'gm/config/local/station-policy-signing-private-key.base64'),
    [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path (Get-Location) 'gm/config/local/policy-development.key')))
)
$localPolicyPublicKey = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path (Get-Location) 'gm/config/local/policy-development-public.key')))
Remove-Item -LiteralPath gm/config/local/policy-development.key,gm/config/local/policy-development-public.key
```

Sačuvajte `$localPolicyPublicKey` kao javni deployment podatak za razvojni Client. Root Compose fiksira key ID na `local-development-ed25519-v2`; Client-u prosledite isti ID. Za host backend postavite `STATION_POLICY_SIGNING_PRIVATE_KEY` u environment procesa ili ignorisani root `.env` i `STATION_POLICY_SIGNING_KEY_ID` na isti ID. Promenljiva sa sufiksom `_FILE` radi kroz kontejnerski entrypoint, ne kroz direktni Maven start. Ne ispisivati privatni ključ niti ga kopirati na Client.

## Lokalni Compose i HTTPS za Client

Posle pripreme root `.env` i signing fajla:

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f backend
docker compose down
```

Nazivi volume-a u konfiguraciji su `gmanager_mysql` i `gmanager_uploads`; Docker ih obično prefiksuje Compose project imenom. `down` ih čuva. Promena `DB_PASSWORD` ne menja lozinku već inicijalizovanog MySQL volume-a.

Opcioni [compose.client-https.yml](../../compose.client-https.yml) dodaje Caddy sa internim CA:

```powershell
docker compose -f docker-compose.yml -f compose.client-https.yml up -d client-https
```

[Caddyfile](../../Caddyfile.client-local) definiše `https://localhost:8443` i `https://gmanager.test:8443` i prosleđuje ih **direktno backendu**. To nije kompletan SPA HTTPS frontend. Za udaljenu stanicu `localhost` označava samu stanicu; `gmanager.test` mora DNS/hosts podešavanjem pokazivati na server. Pripremite firewall i poverenje u CA koji je generisala konkretna Caddy instanca. Prisustvo `.crt` fajla u repozitorijumu ne dokazuje da je to CA trenutnog Caddy volume-a. TLS provera se ne isključuje.

## Početni podaci i razvoj Client-a

Migracije kreiraju šemu i ugrađene referentne podatke, ali ne pune kompletnu demo igraonicu. [Development seed](../DEVELOPMENT_SEED.md) je odvojen i zahteva postojeći `owner@example.com` nalog. Posle seed-a proverite konkretne resource dodele zaposlenih pre gaming operative.

Za Service/Shell razvoj koristite [Windows Client vodič](../operations/WINDOWS_CLIENT.md). `start-development.ps1` zahteva prethodno pripremljene izvršne fajlove i ne radi build. Development ne primenjuje Windows restrikcije i ne potvrđuje fizički lock.

Provere za kasnije izvršavanje su u [TESTING.md](TESTING.md); dijagnostika starta u [TROUBLESHOOTING.md](../operations/TROUBLESHOOTING.md).
