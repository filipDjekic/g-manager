# Uklanjanje starog gaming billing sistema — V51

Izmene su pripremljene u izvornom kodu. Testovi, build, lint, typecheck, Docker i migracija baze nisu izvršavani tokom ove izmene.

## Aktivni sistem

Jedini aktivni režim je `TIME_BALANCE`: ručno primljena uplata za najmanje 30 celih minuta, jedna verzionisana cena minuta u RSD, dodela računara i potvrđena prijava registrovanog korisnika. `CASH` i `EXTERNAL_POS` su oznake već primljene uplate; nema poziva procesoru plaćanja. Izostavljen `method` iz starijeg zahteva znači `CASH`.

`GamingTimeService` zadržava postojeće zaključavanje korisnika, stanice, sesije i vremenskog računa, obračun u sekundama, jedinstvene izvore u ledger-u i granicu potpisanog lease-a. Ključ idempotentnosti dopune vezan je za minute, verziju cene, način evidentiranja i referencu. Nepotrošeno vreme nema rok.

## Uklonjeni backend delovi

- `GamingBillingService`: stari session account, dugovanja i novčani wallet saldo.
- `MeteredSessionRuntime` i `MeteredSessionTicker`: preostali adapteri starog imenovanja; pozivaoci koriste postojeći `GamingTimeService`, a periodično obračunavanje radi `GamingTimeTicker`.
- `GamingSessionTransitionPolicy` i test fiksnog početnog trajanja/produženja.
- Enum vrednosti `FIXED_DURATION` i `PREPAID_METERED`, kao i tarifni i novčani atributi aktivnog `GamingSession` modela i DTO odgovora.
- Guest machine prijava i njen UI/protokolski poziv. Aktivna sesija zahteva registrovani nalog.
- Operativni board više ne učitava novčani saldo niti dug po starim pravilima. Expiration worker koristi istu autoritativnu potrošnju vremena kao lease obnova.

Preostale granice trajanja u `GamingSessionProperties` koriste rezervacije; heartbeat/offline parametri služe zdravlju i enforcement-u stanice. Ne predstavljaju tarife niti kupovinu ograničene sesije.

## API

U ovoj izmeni uklonjeni su `GET /api/v1/gaming-billing/sessions/{id}` i `POST /api/v1/machine/guest-login`, kao i stari `report/packages` detalji. Nema preostalih kontrolera za tarife, quote, wallet top-up, kreditne korekcije, package sale, neposredni session start ili staro produženje sesije. Njihovi raniji endpointi ostaju nedostupni; nisu ponovo uvedeni.

Postojeće rute cene, time account-a, `time-grants`, dodela i završetka sesije zadržane su. `GET /gaming-billing/customers/{id}/time/historical-transactions` čita izdvojenu arhivu uz iste staff i resource scope provere kao istorija aktuelnih uplata. Finansijski izveštaj koristi `report/history` za arhivu; taj zbir ne ulazi u aktuelne prihode. Postojeći istorijski `TIME_REFUND` zapisi se čuvaju; nije uveden novi način povraćaja.

## Frontend

- `GamingWalletPanel` zamenjen je nazivom `GamingTimePanel`; prikazuje samo trajno vreme i ručnu dopunu. Profil klijenta i korisnička početna stranica koriste isti prikaz.
- `useGamingPurchase`, `PurchaseFields`, `gamingTimeApi`: izbor gotovine ili spoljnog POS-a, opciona POS referenca i isti obračun minuta/cene.
- `StationFinanceActions`, `GamingStationViews`, `GamingVisitList`, session tipovi i `gamingBillingApi`: uklonjeni wallet, tarifni i stari session-payment prikazi.
- `GamingPaymentHistory`: aktuelne uplate i zaseban izbor istorijske arhive.
- `GamingFinanceReport`: samo aktuelne ručne uplate/refundacije u tekućim tabelama; jasno odvojena istorijska evidencija.
- Uklonjeni stari testni API mockovi. Testovi panela preimenovani i prilagođeni novom zahtevu.

## Migracija i očuvanje podataka

Nova Java Flyway migracija je `gm/src/main/java/db/migration/V51__retire_legacy_gaming_billing.java`. Objavljeni SQL fajlovi V1–V50 nisu izmenjeni. Java migracija koristi JDBC da bi isti postupak bio dostupan MySQL-u i izolovanim H2 ugovornim testovima.

Pre prvog uklanjanja proverava aktivne stare sesije, usaglašenost vremenskog računa i ledger-a, granice starih paketa, već izvršenu V48/V50 konverziju i zavisnosti stranih ključeva. Nepodržane veze ili neusaglašeni podaci prekidaju migraciju jasnom porukom. Stari novac se nikada ne pretvara u minute.

| Izvor | Nezavisna istorijska kopija |
| --- | --- |
| `gaming_wallet_ledger` | `gaming_history_wallet_entries` |
| `gaming_time_packages` | `gaming_history_packages` |
| `gaming_tariffs` | `gaming_history_tariffs` |
| `gaming_charges` | `gaming_history_charges` |
| `gaming_business_policy` | `gaming_history_policy` |
| Stari redovi `gaming_sessions` | `gaming_history_sessions` |
| Stare finansijske operacije | `gaming_history_financial_operations` |

Kopije zadržavaju originalne identifikatore, iznose, snimke pravila i datume. Nemaju operativne strane ključeve ka korisnicima ili katalogu, pa kasnije poslovne promene ne brišu arhivu. Backend ne izlaže operacije pisanja u arhivske tabele.

Tek kada su sve kopije potpune, stare wallet/package/tariff/charge/policy tabele se uklanjaju. Cena i verzija prelaze u `gaming_time_price`. Iz aktivne finansijske tabele izdvajaju se stare operacije, a ograničenja dozvoljavaju samo `TIME_GRANT`/`TIME_REFUND` i `CASH`/`EXTERNAL_POS`.

Stari završeni session redovi ostaju pod istim ID-jem zbog veza sa komandama, audit-om i istorijom poseta. Dobijaju oznaku `HISTORICAL`, koja baznim ograničenjem ne može biti `ACTIVE`; izvorni režim i svi uklonjeni atributi sačuvani su u arhivi. Tarifne kolone, novčani obračun i `legacy_minutes` uklonjeni su iz operativne sesije. Default novih sesija je `TIME_BALANCE`.

`gaming_time_accounts` i `gaming_time_ledger` se ne prepisuju. V51 ne dodaje nijednu sekundu niti ponavlja V48/V50 konverzije. Audit, komande i potvrde zaključavanja se ne menjaju. Finansijski izveštaji ne sabiraju arhivirane operacije sa aktuelnim uplatama, niti knjiže migraciju vremena kao nov prihod.

## Windows Client kompatibilnost

Verzija potpisanog protokola ostaje v1. Ranije instalirani Client koji već podržava `TIME_BALANCE` može nastaviti da čita iste poruke. Backend izdaje samo taj aktivni režim; novi Client odbija stare/nepoznate aktivne režime i guest lease. `balance` i `chargedAmount` ostaju isključivo prazna v1 transportna polja, bez obračuna, prikaza i prava pristupa. Njihovo fizičko uklanjanje zahteva zasebnu promenu ugovora.

Nazivi kolona `billed_seconds`, `last_billed_at` i `metered_lease_until` ostali su jer ih koristi autoritativna potrošnja trajnog vremena. Nisu ostavljeni tarifni algoritmi. Lease potpis, monotoni sat, cursor, potvrda lokalnog zaključavanja i oporavak ostaju postojeći mehanizmi.

Reference na stare režime u nepromenjenim V1–V50 migracijama, arhiviranim ugovorima i negativnim regresionim testovima ostaju namerno. Nijedna ne omogućava kreiranje ili korišćenje nove sesije po starim pravilima. Raniji generisani API inventari i rezultati merenja su istorijski snimci, ne novi ugovor.

## Primena i kasnije provere

V51 koristi DDL koji na MySQL-u nije transakcion. Primenu raditi u održavanju: završiti stare aktivne sesije prethodnom podržanom verzijom, zaustaviti sve backend instance koje mogu pisati i imati konzistentnu rezervnu kopiju. Migracija namerno odbija aktivnu staru sesiju umesto da pretpostavi pravilo konverzije. Ako DDL prekine izvršavanje, ne pokretati slepi `repair`/ponavljanje; sačuvati arhive i utvrditi tačan korak, odnosno vratiti konzistentnu kopiju pre ponovnog pokušaja. Ne startovati stari backend na V51 šemi.

Naknadno izvršiti:

- `GamingTimeMigrationTest` i `GamingTimeMigrationIT`: V47/V48/V49 → V50 → V51, nepromenjeni checksum-ovi, arhiva, bez duplih minuta i prekid za nerešene stare sesije.
- `GamingTimeIntegrationTest`, `GamingTimeMySqlIT`, `PilotGamingCenterIT`: cene, CASH/POS, idempotentnost, ovlašćenja, konkurentne dopune i potrošnja, istek, odjava, nastavak sledeće posete i finansijski izveštaj.
- Session, resource, reconciliation, performance i report regresije zbog uklonjenih DTO polja i novih ograničenja.
- `GamingTimePanel.test.tsx`, `e2e/gaming-time.spec.ts` i frontend regresije: dopuna, POS referenca, neizvestan odgovor, istorijska arhiva, profili i finansijski pregled.
- Client `TimeBalanceLeaseTests`, `SessionLeaseFailureTests`, `PilotRecoveryTests` i ostatak Client regresije; fizičko zaključavanje, odjava, mrežni prekid, restart i obnova na stvarnoj Windows stanici.
- Backend/frontend/Client build i ostale projektne kontrole tek u odvojenom koraku. Nijedna od ovih provera nije izvršena u ovoj izmeni.
