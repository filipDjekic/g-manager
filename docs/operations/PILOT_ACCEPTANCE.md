# Gaming center pilot — prihvatanje

Ovaj paket priprema ograničeni pilot na **3–5 namenskih Windows računara**. Automatizovani ACK, Development Mode i mock Windows pozivi ne dokazuju fizičko zaključavanje, privatnost ili kompatibilnost igre. Produkciona spremnost se ne podrazumeva.

## Automatizovane provere

Iz korena repozitorijuma, uz Java 21, Node, .NET 10 i Docker Desktop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-pilot.ps1
```

Rezultati i izlazni kod svake grupe: `artifacts/pilot/<UTC>/results.json` i pripadajući logovi. Skripta prekida na grešci. `-SkipMySql`, `-SkipPerformance`, `-SkipBackupContainer` i `-SkipBrowser` služe za lokalni rad; takav rezultat nije pun pilot prolaz. Za browser provere instalirati Chromium pomoću `npx playwright install chromium` iz frontend direktorijuma. Testovi ne prihvataju produkcioni DB URL i ne menjaju Windows politike razvojnog računara. MySQL i backup objekti su jednokratni Testcontainers podaci.

Pojedinačne komande iz `gm/`:

```powershell
.\mvnw.cmd verify
.\mvnw.cmd verify -Pmysql-it '-Dit.test=PilotGamingCenterIT,PilotBackendRestartIT,GamingBillingConcurrencyIT,GamingSessionConcurrencyIT,ResourceConcurrencyIT,MySqlSchemaIT'
.\mvnw.cmd verify -Pmysql-it '-Dit.test=BackendPerformanceIT' '-Daudit.label=pilot'
```

Merenja su u `gm/target/backend-performance-pilot.json`: realni HTTP zahtevi prema lokalnom backendu, MySQL, 5/20 machine identiteta, heartbeat/poll i četiri paralelna čitača board-a. Smoke prag za par heartbeat/poll je 5 s. To nije SLA, test stabilnosti tokom smene ili merenje WAN mreže. Postojeći k6 scenario `performance/k6/critical-flows.js` ostaje dostupan za duži test u izdvojenom okruženju.

| Oblast | Automatizovani dokaz |
| --- | --- |
| Pilot smena | `PilotGamingCenterIT`: OWNER, ADMIN, dva EMPLOYEE, deset CUSTOMER, deset registrovanih poseta, pet stvarno autentifikovanih protokolskih klijenata, četiri paralelna talasa, jedna cena minuta i trajno vreme; cena, naplata, prijava, produženje, kraj, sintetički lock ACK i priprema |
| Konkurentnost i novac | Postojeći `GamingTimeIntegrationTest`, `GamingTimeMySqlIT`, `GamingSessionConcurrencyIT`, `ResourceConcurrencyIT`; dopuna trajnog vremena i završetak i rezervacije dva zaposlena; verzionisana cena minuta; ledger i restore iznosi |
| Premeštanje | Novi test proverava da su oba lease-a LOCK dok izvor ne potvrdi lock, potom samo odredište ACTIVE; nema dodatne naplate |
| Restart baze/servera | Stvarni restart isključivo test MySQL kontejnera; ponovno slanje sa istim ključem; `PilotBackendRestartIT` zatvara i ponovo pokreće ceo Spring kontekst sa HTTP serverom nad istom test bazom |
| Backup | Stvarne `backup-set.sh` / `restore-drill.sh`: šifrovanje, checksum, izdvojena šema, finansijski invarianti, obnovljen test dokument; `test-safety.sh` proverava odbijanje opasnih parametara i neispravnog backup-a bez pristupa bazi |
| Client recovery | `PilotRecoveryTests`: stvarni runtime, potpisi i privatni privremeni DPAPI identitet; izgubljen ACK i restart, DNS/TLS/timeout/prekid, istek tokena, grace rok, stariji cursor, neispravne i strane komande, oštećen snapshot. Windows enforcement je Development Mode |
| Windows instalacija/politike | `windows-enforcement.Tests.ps1` uključuje transakcione update/rollback/recovery testove; OS pozivi su izolovani. Postojeći .NET testovi proveravaju aplikaciona pravila i Home/Pro capability izbor |
| Frontend/security | Postojeći testovi finansijskih retry ključeva, pripreme, uloga i zastarelog board-a; novi prikaz grešaka i redakcija protokolskih tajni |

Test podaci imaju determinističke identifikatore/nazive i relativne vremenske intervale. Lozinka `PilotPass1!` postoji samo u izolovanoj fixture; ne praviti te naloge u stvarnoj igraonici. Privatni signing/machine ključevi generišu se pri testu.

## Priprema fizičke provere

Zabeležiti release commit, potpis paketa, Windows izdanje/build, hardver, verzije igara i anti-cheat komponenti za PC1–PC5. Obezbediti poseban administratorski nalog, standardni Player nalog, backup i lokalni recovery paket. Nova izmena skripte zahteva novo potpisivanje kroz `client/packaging/publish.ps1`; izvorne skripte nisu gotov potpisani release.

Koristiti izdvojenu pilot lokaciju/bazu, interne evidencije CASH/EXTERNAL_POS i test kupce. EXTERNAL_POS je evidencija potvrđene spoljne naplate, ne procesor kartica. Dokument nije fiskalni račun. Podesiti cenu minuta i dodele zaposlenih pre sesija. Ne otvarati igraonicu ako je početni enforcement UNKNOWN, postoji Client greška ili zastareo heartbeat.

## Ručna checklista — obavezno za svaki PC

Upisati PASS/FAIL, UTC vreme i referencu na dokaz za svaku stavku; prazno znači **NEPROVERENO**.

- [ ] Instalacija novog potpisanog paketa, provereni service startup/recovery i Shell zadatak; zasebno Home i Pro ako su oba u pilotu.
- [ ] Jednokratni enrollment, pravi machine identitet, ispravna konfiguracija i verzija; ponovna upotreba tokena i pogrešan ključ odbijeni.
- [ ] OWNER/ADMIN uređuju lokaciju, PC, cenu minuta, dodele i maintenance; EMPLOYEE ima pristup samo dodeljenim resursima; CUSTOMER ne otvara management funkcije.
- [ ] CASH i potvrđeni spoljni POS, kredit i paket; stvarno primljeni iznos odgovara serverovoj ceni. Dva zaposlena istovremeno koriste različite PC-jeve.
- [ ] Registrovana prijava dodeljenog korisnika; deset poseta u više talasa; preostalo vreme ostaje na nalogu i prethodni identitet nije dostupan sledećem korisniku.
- [ ] Odobrena igra radi; neodobren EXE, preimenovan command host, neodobren helper i nov child proces ostaju blokirani.
- [ ] Produženje menja cenu, ledger i prikaz vremena tačno jednom; gubitak odgovora se rešava istim zahtevom/ključem.
- [ ] Istek, ručni kraj i force-lock fizički onemogućavaju igranje i prebacivanje na desktop/drugu sesiju. Proveriti Task Manager, hotkeys, preostale procese i logoff Player naloga.
- [ ] Običan command ACK ne prikazuje PC spremnim. Bez potvrđenog lokalnog lock-a i odvojene pripreme nema novog korisnika.
- [ ] Premeštanje: izvor fizički zaključan pre pristupa odredištu; nema istovremenog igranja, gubitka preostalog vremena ili nove naplate.
- [ ] Naredni korisnik ne vidi Steam/Epic/Riot/Discord/browser naloge, tokene, istoriju, download ili privremene privatne podatke prethodnika. Sačuvani game saves i instalirane igre ostaju očuvani. Ako izolacija nije potvrđena, odbiti pripremu.
- [ ] Sve stanice rade paralelno najmanje jednu planiranu probnu smenu; obuhvatiti rezervacije i smenu zaposlenih. Evidentirati dužinu testa, broj poseta, greške i latencije.
- [ ] Izvršen izolovani restore baze i pripadajućih dokumenata, proveren finansijski ledger i usaglašene uplate posle vremena izabranog backup-a sa stvarnim POS/gotovinskim dokazima. Operator je prihvatio izmereni RPO/RTO; dnevni snapshot sam ne garantuje oporavak svih kasnijih uplata.

## Prekid i oporavak — samo namenski test PC i izolovani server

1. Tokom plaćene test sesije odvojiti mrežni kabl ili isključiti izdvojeni mrežni port. Kratak prekid ne dodaje vreme; nakon potpisanog `graceEndsAt` ili kraja sesije proveriti fizički lock. Vraćanje mreže samo po sebi ne otključava lokalno blokiranu sesiju.
2. Ponoviti prekid tokom naplate, produženja i lock potvrde. Proveriti isti idempotency ključ, jednu transakciju i naknadno usaglašavanje ACK-a. Bez sigurnog ishoda ne izdavati novu naplatu.
3. Na izdvojenom serveru restartovati backend i MySQL tokom probne sesije. Ne koristiti `down -v`. Proveriti deadline, ledger, identitet i recovery nakon vraćanja veze.
4. Restartovati **namenski** Windows PC preko Windows menija tokom aktivne i istekle sesije; proveriti automatski Service/Shell i zaključan početak, bez automatskog nastavka igre. Neočekivano gašenje Service-a testirati samo na tom računaru.
5. Power-loss proba zahteva zatvorene stvarne dokumente, backup, test nalog i osobu uz računar. Isključivanje napajanja sprovodi operator na namenskom PC-ju. Nijedna skripta paketa ne gasi razvojni računar.
6. Proveriti update ispravnog i neispravnog paketa, prekid update-a, rollback, maintenance i njegov istek, repair, uninstall bez purge-a i reinstall sa očuvanim identitetom. Uporediti Windows politike pre instalacije i posle uninstall-a.
7. Oštećen lokalni snapshot / zastarela vraćena baza moraju dati zaključano stanje i dijagnostičku grešku. `SERVER_STATE_ROLLBACK` zahteva izolaciju stanice i administratorsko usaglašavanje; ne smanjivati lokalni cursor, ne menjati `endsAt` i ne brisati snapshot da bi se provera zaobišla. Cutover posle restore-a ostaje blokiran dok svaka stanica nije bezbedno usaglašena/reprovisionovana uz opoziv starog identiteta.

## Kompatibilnost aplikacija

Trenutni fizički status svih sledećih aplikacija je **NEPROVERENO**: Steam, Counter-Strike 2, Epic Games Launcher, Riot Client, Valorant, Discord, browser-i, njihove pomoćne/child i anti-cheat komponente.

Za svaki tačan build: pokrenuti igru, login/logout, overlay, update, helper i anti-cheat servis, pa istek sesije i sledećeg korisnika. Iz `pilot-diagnostics.ps1` pregledati `applications.json` i `process-paths.json`; eksplicitno dodati tačne executable putanje i hash ili publisher uslove u postojeći aplikacioni profil. HELPER i dependency group nisu opšte odobrenje potomaka. Objaviti novi potpisani profil i ponoviti test. Ne isključivati Windows zaštitu, TLS ili anti-cheat radi prolaza.

## Backup i dijagnostika

Pratiti [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md). Scheduler je opt-in `backup-scheduled` profil; zdravlje kontejnera proverava starost poslednjeg uspeha, a neuspeh zahteva alarm operatora. DB backup sam ne sadrži dokumente. Za lokalne dokumente `backup-set` zahteva stvarno pauzirane upise/GC i `BACKUP_WRITES_QUIESCED=true`; za S3 sačuvati upareni snapshot/versioned objekata. Ključeve i konfiguraciju čuvati odvojeno u zaštićenom backup-u.

OWNER/ADMIN u operativnom ekranu vidi dijagnostiku servera/baze/finansijskog ledgera, greške stanice i poslednji update. Prometheus alarmi obuhvataju offline/lock pending, recovery/update i finansijske invariante; proveriti stvarnu isporuku alarma. Backup scheduler health mora posebno biti uključen u monitoring hosta.

Na test PC-ju, iz potpisanog paketa ili zaštićenog recovery direktorijuma:

```powershell
.\pilot-diagnostics.ps1 -OutputDirectory C:\PilotEvidence\PC1
```

Skripta čita stanje, potpise/hash-eve i putanje procesa; ne menja politike i ne kopira identitet, tokene, lozinke, command line, browser podatke ili saves. Priložiti UTC vremensku liniju i oznaku testa. Dokaze čuvati zaštićeno; pregledati putanje i lične podatke pre deljenja. Za UI/API greške sačuvati request ID bez Authorization/cookie zaglavlja.

## Odluka

- **Prihvati ograničeni pilot** tek kada sve automatizovane grupe prolaze i sve obavezne fizičke stavke imaju dokaz na 3–5 PC-jeva, sa potvrđenim igrama, privatnošću, backup/restore postupkom i dostupnim operatorom za oporavak.
- **Odbij / zaustavi pilot** pri bilo kom fizičkom bypass-u, duploj naplati/potrošnji, neobjašnjenom saldu, nebezbednom premeštanju, curenju naloga, neuspešnom recovery-u ili nedokazanoj privatnosti. Stanicu staviti u maintenance i sačuvati dokaze.
- Potpis odluke: release / datum / operator / PC-jevi / izuzeci / PASS ili FAIL. Automatizovani prolaz bez fizičke provere znači **spremno za laboratorijsko prihvatanje, pilot još nije odobren**.

## Posle V51

Raniji rezultati u ovom dokumentu ne potvrđuju izmenu V51. Za aktuelni postupak i naknadne provere koristiti [uklanjanje starog billing sistema](GAMING_BILLING_RETIREMENT.md). Tok je ručna dopuna → dodela → prijava; tarife, guest sesije i paketi nisu dostupni.
