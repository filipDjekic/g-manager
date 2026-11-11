# CI #146 — ispravke i verifikacija

Referenca: [GitHub Actions run 42869983338](https://github.com/filipDjekic/g-manager/actions/runs/42869983338), `main`, `0f2c2ff09f236d61db9b05bf39082c3f6034e637`. GitHub logovi potvrđuju četiri opisana neuspešna posla. Ovaj dokument opisuje lokalne izmene; referentni run ostaje rezultat originalnog commita.

## Uzroci i izmene

1. **Backend quality / MySQL migration:** V51 je koristila CTAS pa dodavala PK. H2 CTAS ne prenosi `NOT NULL` na ID. Svih sedam arhiva sada se kreira sa izvornim tipovima, precision/scale/nullability i PK pre kopiranja. Generisane kolone se materijalizuju. Za MySQL se preciznost timestamp-a čita iz `information_schema.columns.DATETIME_PRECISION`: Connector/J `ResultSetMetaData.getScale()` vraća numerički scale `0` i za `TIMESTAMP(6)`, pa ne sme da određuje vremensku preciznost. Proveravaju se ID-jevi, broj redova i sve vrednosti pre uklanjanja izvora. Saldo, vremenski ledger, aktuelne finansijske operacije, audit i komande se ne prepisuju. Provere pre arhiviranja uključuju aktuelni ugovor sesije i nenegativnu verziju cene.
2. **Greške iza prvog migracionog pada:** negativni migracioni fixture je aktivirao već završenu sesiju bez uklanjanja `ended_at`; logout fixture je koristio nepostojeći identitet mašine, pa nije mogao da sačuva audit; pilot fixture je još upisivao uklonjene tarife. Fixture-i sada predstavljaju validne podatke novog sistema; postojeće provere ponašanja nisu uklonjene. Pravi MySQL je potom otkrio samoblokiranje logout-a: obračun zaključava sesiju, a audit u `REQUIRES_NEW` transakciji čeka FK lock nad tom sesijom. Potvrđeni logout sada koristi postojeći `writeConfirmed` i istu transakciju, pa audit, završetak i potrošnja vremena zajedno commit-uju. Neuspešne prijave zadržavaju zasebnu trajnu audit transakciju. Regresije proveravaju oba audit ishoda, saldo i ponovljenu odjavu.
3. **Production infrastructure contracts:** `.dockerignore` nije uključivao `time-ledger-check.sql`; i zaseban Testcontainers build context imao je isti propust. Oba uključuju sve COPY ulaze. Restore je zatim morao da bira finansijske SQL provere prema Flyway verziji jer V51 uklanja stare operativne tabele. Dodate su nezavisne provere build context-a i stvarnog restore skripta za V47/V50/V51, uključujući odbijanje neusaglašenih ledger-a.
4. **Browser E2E and accessibility:** test je uključivao dekorativnu strelicu u pristupačni naziv linka. Mock-ovi su koristili stare gaming session/security rute i nepaginarane report/schedule odgovore; zbog pogrešnih tipova stranice `/home` i `/reports` nisu mogle da se renderuju. Selektori i mock ugovori sada prate aktuelni API. Provere razlikuju sidebar, mobilni drawer i donju navigaciju; pokrivaju uloge, zatvaranje/Escape/vraćanje fokusa, AI saglasnost, podrazumevano isključen AI, isključene Reports i zabranu pristupa kupcu.

Produkcioni feature flag defaults, navigacioni model i pragovi CI provera nisu promenjeni. Nema vraćanja wallet-a, tarifa, prepaid-a ili paketa.

Stvarni backup test otkrio je i zavisnost od trajanja testa: fixture je jednom pribavio mašinski token (300 sekundi), pa nakon višeminutnog dump/restore postupka dobio 401. Sada simulira isti Ed25519 challenge/token postupak, potpisane lease obnove i aktivne heartbeat poruke kao živi klijent, bez produžavanja produkcionih rokova. Svaka neuspešna obnova obara test. Nova negativna regresija zatim je dokazala stvarni 503 tokom backupa: mašinski endpoint jeste bio izuzet iz pauze, ali njegova ugnježdena transakcija potrošnje vremena nije. Barrier sada prepoznaje serverom autentifikovan mašinski principal kroz zajednički port i propušta njegov protokolski tok. Obične uplate i dokumenti ostaju blokirani; snapshot baze ostaje transakcioni. Regresija proverava aktivnu sesiju, 503 za uplatu i nepromenjen broj finansijskih operacija.

## Promenjeni fajlovi

- Migracija: [V51](../../gm/src/main/java/db/migration/V51__retire_legacy_gaming_billing.java).
- Atomski logout i audit: [MachineProtocolService](../../gm/src/main/java/com/game_manager/gm/machine/MachineProtocolService.java).
- Kontinuitet mašinskog protokola tokom backupa: [BackupWriteBarrier](../../gm/src/main/java/com/game_manager/gm/common/operations/BackupWriteBarrier.java), [MachineStationIdentity](../../gm/src/main/java/com/game_manager/gm/common/security/MachineStationIdentity.java), [MachinePrincipalProvider](../../gm/src/main/java/com/game_manager/gm/machine/MachinePrincipalProvider.java).
- Zajednički H2/MySQL migracioni ugovori: [GamingTimeMigrationContract](../../gm/src/test/java/com/game_manager/gm/testsupport/GamingTimeMigrationContract.java).
- Backend fixture-i: [GamingTimeIntegrationTest](../../gm/src/test/java/com/game_manager/gm/gamingsession/GamingTimeIntegrationTest.java), [PilotGamingCenterIT](../../gm/src/test/java/com/game_manager/gm/gamingsession/PilotGamingCenterIT.java), [BackupTestImage](../../gm/src/test/java/com/game_manager/gm/gamingsession/BackupTestImage.java).
- Backup regresije: [ProductionBackupIT](../../gm/src/test/java/com/game_manager/gm/gamingsession/ProductionBackupIT.java), [ProductionOperationsIntegrationTest](../../gm/src/test/java/com/game_manager/gm/gamingsession/ProductionOperationsIntegrationTest.java) (isti ugovori se nasleđuju na MySQL-u).
- Browser ugovori: [critical-flows.spec.ts](../../frontend/g-manager/e2e/critical-flows.spec.ts), [fixtures.ts](../../frontend/g-manager/e2e/fixtures.ts).
- Backup image: [Dockerfile](../../ops/backup/Dockerfile), [.dockerignore](../../ops/backup/.dockerignore).
- Restore integritet: [restore-drill.sh](../../ops/backup/restore-drill.sh), [history-ledger-check.sql](../../ops/backup/history-ledger-check.sql), [test-safety.sh](../../ops/backup/test-safety.sh), [test_backup_image.py](../../ops/deploy/tests/test_backup_image.py).
- Dokumentacija: [gaming vreme](../GAMING_TIME.md), [operativno uputstvo](GAMING_BILLING_RETIREMENT.md) i ovaj izveštaj.

## Migraciona kompatibilnost

V1–V50 ostaju neizmenjene. V51 je Java migracija čiji je checksum bio i ostaje `null`. Već uspešna V51 se normalno validira i preskače; stare arhive ostaju čitljive. Nema ručnog ponavljanja, `repair` ili ignorisanja validacije. Offline postupak i recovery za delimično neuspešnu primenu opisani su u [operativnom uputstvu](GAMING_BILLING_RETIREMENT.md#primena-i-kasnije-provere).

## Izvršne provere

Windows okruženje koristi JDK 21, Maven 3.9.14 iz iste distribucije kao wrapper, Node 24.21.0 i Docker Linux engine. Browser radnici i JVM memorija lokalno su ograničeni radi raspoloživih resursa; nisu promenjeni CI timeout-i, obuhvat testova ili coverage pragovi.

| Provera | Rezultat |
| --- | --- |
| Maven `clean verify` | PASS — 293 testa, 0 failures/errors/skips, Checkstyle 0 violations, JaCoCo prag ispunjen, CycloneDX SBOM generisan i upakovan |
| Maven `verify -Pmysql-it` | U TOKU — završno kompletno izvršavanje nakon ispravki logout-a i aktivnog klijenta tokom backupa; ciljani migracioni i audit ugovori već prolaze |
| Backup Docker build | PASS — stvarni produkcioni image |
| Linux deploy/rollback/publication/secrets/build-context ugovori | PASS — 16 testova, bez preskakanja u izolovanom Linux kontejneru |
| Backup safety i restore SQL izbor | PASS — 6 bezbednosnih odbijanja, V47/V50/V51 restore, odbijanje nedostajuće arhive i oba neusaglašena ledger-a |
| ClamAV | PASS — zdrav servis, clean ulaz prihvaćen, EICAR odbijen |
| Alertmanager dostava | PASS — stvaran alert JSON i bearer token privatnom privremenom receiver-u |
| Nginx | PASS — tačni verzionisani bajtovi i 404 za odsutne/private/management putanje |
| Vlasništvo volumena | PASS — UID/GID 10001 i stvarno pisanje u document/backup volumene |
| Compose | PASS — puni sklop i 3 testa svih kombinacija overlay-a |
| Bash syntax | PASS — sve deploy/backup skripte i backend entrypoint |
| Prometheus / Alertmanager konfiguracija | PASS — promtool (24 pravila), amtool |
| CI contract | PASS — 11 poslova/obaveznih provera, sve akcije SHA-pinned; 18 negativnih konfiguracija odbijeno |
| CodeQL SARIF gate ugovori | PASS — svih 20 testova parsera i bezbednosnog gate-a; samo CodeQL skeniranje zahteva CI alat |
| Browser E2E + accessibility | PASS — 87 testova; 7 postojećih preskakanja desktop matriksa u mobilnom projektu; 0 padova, 320–2560 px |
| `npm ci` sa npm 11.19.1 | PASS — čist lockfile install, audit prijavio 0 ranjivosti |
| Frontend lint / typecheck | PASS |
| Frontend coverage | PASS — 73 test fajla, 223 testa; linije 79,18%, grane 70,95%, funkcije 67,72%, statements 74,32%; pragovi očuvani |
| Frontend `build:budget` i SBOM | PASS — produkcioni build i postojeći budžeti, CycloneDX JSON generisan |
| PWA | PASS — 1 produkcioni browser test: installable/offline shell i bez API sadržaja u Cache Storage |
| Ciljani H2/MySQL migracioni ugovori na završnoj V51 | PASS — 7 H2 + 7 MySQL 8.4 testova, uključujući sva arhivska polja i mikrosekunde |
| Logout i audit regresije na H2/MySQL | PASS — po 2 testa na obe baze: atomski logout sa sačuvanim saldom i trajni audit neuspešne prijave |
| Backup i kontinuitet aktivnog klijenta | PASS — 7 H2 operativnih testova; stvarni MySQL backup/restore i dodatna MySQL regresija aktivnog lease-a tokom pauze (2 testa, bez preskakanja) |
| Izolovani Windows Client ugovori | PASS — 181 provera OS sposobnosti, policy-ja, probe i deploymenta; Windows API pozivi su mockovani |
| Windows Gaming Client .NET 10 | PASS — restore, Release build sa `-warnaserror` (0 upozorenja), 72 testa bez preskakanja i NuGet politika bez ranjivih direktnih/tranzitivnih paketa |

## Okruženje i granice potvrde

Windows `mvnw.cmd` je pre starta Maven-a naišao na lokalnu grešku `.Target[0]` pri pronalaženju wrapper direktorijuma. Provere su zato izvršene direktno Maven 3.9.14 distribucijom koju isti wrapper propisuje, sa istim projektom i lifecycle/profile proverama. Linux wrapper i CI konfiguracija nisu menjani. Lokalni Node 24.21.0 zadovoljava `engines` projekta; CI koristi Node 22.23.3. Frontend quality/PWA komande i čista instalacija izvršeni su sa propisanim npm 11.19.1.

Sve baze i restore ciljevi ovih provera su izolovani test primerci. Za produkciju važi [offline postupak nadogradnje](GAMING_BILLING_RETIREMENT.md#primena-i-kasnije-provere). Fizičko zaključavanje i odjava na instaliranoj Windows gaming stanici zahtevaju tu stanicu i nisu dokazani ovim testovima.

Novi GitHub Actions run za ove lokalne promene nije pokrenut. CodeQL, Trivy i Gitleaks izvršni alati nisu dostupni u lokalnom PATH-u; sami security skenovi nisu ponovo izvršeni. Njihove postojeće CI kontrole i pragovi su očuvani. NuGet provera izvršena je lokalno istim kriterijumom kao u CI-u. Konačnu GitHub potvrdu daje run commita koji sadrži ove izmene.
