# Testiranje i statička verifikacija

Ovaj dokument opisuje postojeće provere i komande za kasnije izvršavanje. **Tokom dokumentacionog pregleda nisu pokretani build, testovi, Docker ili instalacione skripte.** Raniji brojevi prolaznih testova u arhivi nisu aktuelni rezultati.

## Postojeće suite-ove i preduslovi

| Provera | Obuhvat i granice |
| --- | --- |
| Backend `*Test` | JUnit/Spring/MockMvc, H2, role/scope/auth, poslovni tokovi, dokumenti, izveštaji, jobs/outbox, protocol i ArchUnit; ne dokazuje MySQL niti fizički Windows |
| Backend `*IT` uz `mysql-it` | MySQL 8.4 kroz Testcontainers: migracije, schema i konkurentnost; zahteva Docker daemon |
| Frontend Vitest | Modeli, React komponente, forme, guards, API greške i offline storage; jsdom, MSW i test fixtures |
| Playwright | Desktop/mobile tokovi, UI, accessibility i vizuelni scenariji; API fixtures u `e2e/fixtures.ts`, nisu live full-stack backend |
| Playwright PWA | Build/preview i browser offline scenariji u `e2e-pwa`; uključuje frontend build |
| .NET | Domain/policy/lease failure testovi; Windows build target, ne instalacija/AppLocker acceptance |
| CI/security | Dependency audit, SBOM, CodeQL SARIF gate, Gitleaks, Trivy; release ima dodatne image i staging provere |

## Komande

Iz korena, brze objedinjene web/backend provere:

```powershell
.\scripts\verify.cmd
```

Bash: `bash scripts/verify.sh`. Obe skripte rade backend `clean verify`, frontend `npm ci`, lint, typecheck, test i build. Ne uključuju .NET, MySQL IT i browser suite. Bash poziv je eksplicitan jer ovaj `.sh` fajl u Git-u nema executable bit.

Backend, iz `gm/`:

```powershell
.\mvnw.cmd clean verify
.\mvnw.cmd verify -Pmysql-it
```

Na Bash-u koristiti `./mvnw`. Surefire isključuje `*IT`; profil `mysql-it` ih uključuje kroz Failsafe. `verify` uključuje Checkstyle, JaCoCo line coverage prag 0.35 i SBOM u package fazi. Konkretni IT scenariji su `MySqlSchemaIT`, `IdempotencyConcurrencyIT`, `ResourceConcurrencyIT`, `GamingSessionConcurrencyIT`, `OutboxConcurrencyIT`, `JobConcurrencyIT`.

Frontend, iz `frontend/g-manager/`, uz npm verziju iz `packageManager`:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build:budget
npx playwright install chromium
npm run test:e2e
npm run test:e2e:pwa
```

Vitest pragovi iz `vite.config.ts`: statements/branches/lines 70%, functions 65%. Playwright koristi port 4173 i sam pokreće Vite; PWA port 4174 i build/preview. Ne pokretati drugi server na tim portovima tokom suite-a.

Windows Client, iz `client/` na Windows-u sa .NET 10 SDK:

```powershell
dotnet restore GManager.Client.slnx
dotnet build GManager.Client.slnx -c Release --no-restore -warnaserror
dotnet test GManager.Client.slnx -c Release --no-build
# Isti izolovani Windows/packaging ugovori bez dodatne test zavisnosti:
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests\windows-enforcement.Tests.ps1
```

Potpunije lokalne CI skripte su `.\scripts\ci.ps1` (uključuje .NET) i `bash scripts/ci.sh` (backend/frontend). PowerShell opcije `-SkipMySql` i `-SkipE2E`, odnosno Bash `SKIP_MYSQL=true` i `SKIP_E2E=true`, preskaču te korake i smanjuju obuhvat. CI skripte rade build i dependency upite; nisu samo read-only provera dokumentacije.

## Ključni funkcionalni scenariji

| Oblast | Šta proveriti |
| --- | --- |
| Auth/customer | Bootstrap bez dupliranja, staff create/activation, replay/expiry aktivacije, odbijen register, login, CSRF refresh/logout, reuse tokena i opoziv |
| Uloge/scope | OWNER/ADMIN staff granice, CUSTOMER tuđi podaci, EMPLOYEE bez resource granta, opoziv granta tokom promene, redigovani prikazi |
| Katalog/vreme | PRODUCT/SERVICE pravila, slika/MIME/limit, inactive filteri, noćne smene, exceptions i Europe/Belgrade DST |
| Booking | Slobodan termin, susedni intervali, paralelni booking, fizički resurs i `requires_resource`, odsustvo, stale version, idempotency/425, recurrence i waitlist |
| Narudžbine | Server cene i zbir, duplirana stavka, handler preuzimanje, dozvoljeni/odbijeni prelazi i CUSTOMER otkazivanje |
| Reports/documents | Own-data download, `PENDING/CLEAN`, public-image izuzetak, checksum, CSV/XLSX formula injection, PDF, job retry/cancel i storage outage |
| Gaming/protocol | Paralelni start, jedan customer/stanica, produženje/version, istek, terminalni status, replay challenge/command, pogrešna stanica, lock ACK i reconciliation |
| Windows | Potpisani paket, standardni nalog, dozvoljene i zabranjene aplikacije, offline grace, sat unazad, restart/reboot, maintenance expiry, update rollback i uninstall/reinstall |

PowerShell suite koristi privatne privremene direktorijume i mockovane Windows policy/service/task API-je. Ne menja AppLocker ni sistemske servise. Pokriva Home/Pro/Enterprise/Education capability matricu, neuspešan enforcement/probe, ownership konflikte, reinstalaciju, prekinuti update/rollback, maintenance expiry i uninstall policy restore. Za fizičke scenarije koristiti [Home/Pro acceptance matricu](../operations/WINDOWS_CLIENT_ACCEPTANCE.md), namensku stanicu i [rollout vodič](../operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md). Statički pregled/test klase ne potvrđuju stvarno zaustavljanje procesa ili fizički LOCK_ACK.

## CI i release

[ci.yml](../../.github/workflows/ci.yml) definiše gaming-client, contract, backend, mysql, frontend, e2e, dependency-review, CodeQL, secrets i filesystem-security poslove. [release.yml](../../.github/workflows/release.yml) je zaseban workflow za numeric release tag ili dispatch: potpisani Client kandidat, image build/digests, deployment, a na staging-u rollback/k6/ZAP. Prisustvo workflow-a ne potvrđuje aktivna repository pravila, pristup registry-ju, dostupnost runner-a ili rezultat poslednjeg izvršavanja. Release nije eksplicitno zavisan od uspešnog CI workflow-a.

CodeQL ne upload-uje SARIF u Code Scanning; lokalni gate proverava rezultate i čuva artefakte. Detalji su u [CODEQL_SETUP.md](../operations/CODEQL_SETUP.md).

Za dokumentacione promene dovoljni su statička provera navedenih komandi prema skriptama/manifests, svih relativnih linkova i `git diff --check`. Ne menjati aplikacioni kod ili pokretati build samo radi potvrde sadržaja vodiča.
