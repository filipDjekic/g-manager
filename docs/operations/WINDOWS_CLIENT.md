# Upravljanje G-Manager Windows Client-om

Ovo je centralni vodič za kod u [client/](../../client), [packaging skripte](../../client/packaging) i njihov operativni ugovor. Izvorni kod nije dokaz da postojeći ZIP odgovara checkout-u ili da je fizička stanica proverena. Komande ispod nisu izvršavane tokom pregleda dokumentacije. Za backend preduslove pogledajte [deployment](DEPLOYMENT.md), a za prihvatanje izdanja [pilot rollout](GAMING_CLIENT_PRODUCTION_ROLLOUT.md).

## Arhitektura i priprema za razvoj

Solution `client/GManager.Client.slnx` sadrži Domain, Protocol, Service, Shell i test projekat. Target je `net10.0-windows10.0.19041.0`; SDK je u [global.json](../../client/global.json). Production Service `GManagerClient` radi kao **LocalSystem**; WPF Shell i odobrene igre rade u sesiji izabranog standardnog Windows naloga. Named pipes proveravaju Windows identitete i odvajaju korisničke od elevated administratorskih operacija.

Za pripremu razvojnih izvršnih datoteka, na Windows-u sa .NET 10 SDK, iz korena:

```powershell
dotnet build client/GManager.Client.slnx -c Debug
```

To je komanda za kasnije izvršavanje; development launcher sam ne pokreće build. Default launcher putanje očekuju Debug output za Service i Shell i `runtime-capabilities.json`. Za Release ili drugi izlaz koristiti eksplicitne `-ServiceExecutable`/`-ShellExecutable` parametre.

Konfiguracija instalirane verzije je u ACL-zaštićenom `%ProgramData%\GManager\Client\client.json`; proizvoljni environment/CLI parametri je ne nadjačavaju. Development koristi `%LOCALAPPDATA%\GManager\Development`, zaseban pipe i DPAPI CurrentUser. Production identity koristi DPAPI LocalMachine i zaštićene ACL-ove. Backend BaseUrl je origin sa završnom `/`, npr. `https://gmanager.example/`; Protocol sam dodaje `api/v1/machine/...`, pa mu ne dodavati `/api/v1/`.

## Razvoj, izdavanje i instalacija

Komande ispod pokreću se iz CMD-a. Zamenite vrednosti servera, javnog policy ključa, key ID-a, subject-a i thumbprint-a stvarnim deployment vrednostima. Privatni Ed25519 ključ ostaje isključivo na backendu.

**Razvojni laptop - bez administratora**

Potrebne su nove, prethodno pripremljene Service/Shell izvršne datoteke iz ovog izvornog koda. Skripta ne radi build. Stari binarni fajlovi bez `runtime-capabilities.json` se odbijaju. Framework-dependent razvojni izlaz zahteva odgovarajući .NET 10 Desktop Runtime; objavljeni self-contained izlaz ga sadrži.

```cmd
cd /d C:\putanja\g-manager
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "client\packaging\start-development.ps1" -BackendUrl "https://localhost:8443/" -PolicySigningPublicKey "%POLICY_PUBLIC_KEY%" -PolicySigningKeyId "%POLICY_KEY_ID%"
```

Opcije `-ServiceExecutable "C:\izlaz\service\GManager.Client.Service.exe" -ShellExecutable "C:\izlaz\shell\GManager.Client.Shell.exe"` biraju drugi već pripremljeni izlaz. Za lokalni backend dozvoljen je i loopback HTTP, npr. `http://localhost:8080/`. HTTPS zahteva normalno važeći sertifikat. Skripta traži jednokratni token samo kada razvojni identitet još ne postoji, pokreće Service skriveno i Shell u običnom prozoru; zatvaranje Shell-a zaustavlja taj razvojni Service.

Razvojni podaci su u `%LOCALAPPDATA%\GManager\Development`, zaštićeni DPAPI CurrentUser. Koristite zasebnu test stanicu i njen enrollment token iz postojećeg administratorskog interfejsa. Posle pripreme konfiguracije dozvoljeno je i ručno pokretanje oba EXE-a sa `--development`. Nema servisa, UAC zahteva, AppLocker/WDAC/Chrome/Registry/NTFS promena, Windows zaključavanja ili zatvaranja tuđih procesa. Istek zaključava samo Client prikaz. Razvojni Client ne šalje fizički LOCK_ACK. Instalirani produkcioni servis onemogućava razvojni režim i Service-a i Shell-a.

**Prvo izdanje i instalacija - administrator**

Produkcija: Windows 10 build 19041+ / Windows 11 Enterprise/Education, AppLocker/Application Identity i Scheduled Tasks; zaseban aktivan lokalni standardni nalog igrača i zaseban administratorski nalog za održavanje. OS i igre moraju već biti podržani na tom računaru. Naloge i njihove lozinke održava Windows administrator; Client ne uključuje Windows autologon i ne skladišti te lozinke.

Na release računaru pripremite izdanje sa važećim code-signing sertifikatom, zatim objavite ZIP i metapodatke na konfigurisanom HTTPS serveru:

```cmd
powershell.exe -NoProfile -File "client\packaging\publish.ps1" -CertificateThumbprint "%SIGNING_THUMBPRINT%" -Version "1.0.0"
```

Ova komanda radi publish i potpisivanje kada je administrator kasnije eksplicitno pokrene. Privatni code-signing ključ se ne kopira u paket. Paket sadrži detached CMS potpis `release.p7s` nad kompletnim SHA-256 manifestom `release.json`, kao i Authenticode potpise skripti, EXE-a i sopstvenih DLL-ova. Runtime biblioteke su obuhvaćene potpisanim hash manifestom. Postojeći ZIP u repozitorijumu nije automatski osvežen promenom izvornog koda.

Raspakujte novo izdanje npr. u `C:\Deploy\GManager`. U povišenom CMD-u:

```cmd
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File "C:\Deploy\GManager\GManager-Setup.ps1" -PackageDirectory "C:\Deploy\GManager" -BackendUrl "https://gmanager.lan/" -PlayerAccount "Igrac" -PolicySigningPublicKey "%POLICY_PUBLIC_KEY%" -PolicySigningKeyId "%POLICY_KEY_ID%" -SigningSubject "%SIGNING_SUBJECT%" -SigningThumbprint "%SIGNING_THUMBPRINT%"
```

Pri prvom AllSigned pokretanju proverite Windows prompt za očekivanog izdavača. Installer za pozadinske SYSTEM zadatke evidentira i registruje samo lokalno pinovanog izdavača u LocalMachine TrustedPublisher. Njegov sertifikacioni lanac mora važiti i za LocalMachine, ne samo za korisnički certificate store.

Za lokalni CA dodajte `-LocalCaCertificate "C:\Deploy\root-ca.cer" -ExpectedCaSha256 "%CA_SHA256%"`. Installer proverava CA i očekivani SHA-256 i zahteva da administrator ponovo unese isti fingerprint pre uvoza. TLS validacija se nikada ne isključuje. Ranije postojeći CA/TrustedPublisher unosi ostaju tuđi; uklanjaju se samo unosi čije dodavanje je ovaj installer evidentirao.

U Stations napravite/izaberite stanicu, uključite Client, dodelite postojeći profil aplikacija i generišite jednokratni INITIAL token kroz „Identitet klijenta”. Unesite token u skrivenom installer prompt-u; prenosi se kroz stdin, bez fajla ili argumenta komandne linije. Ponovna instalacija na isti server i Windows nalog zadržava postojeći DPAPI identitet. Promena servera/naloga zahteva plansku migraciju/rotaciju identiteta.

Instalacioni direktorijum je `%ProgramFiles%\GManager Client`, a zaštićeni podaci `%ProgramData%\GManager\Client`. Servis je automatski SYSTEM policy broker; igre pokreće Shell kao standardni korisnik, bez elevacije. Shell task se pokreće pri prijavi izabranog Windows naloga. Update se proverava svakih 15 minuta; recovery na boot-u i svakog minuta.

**Status i bezbedna dijagnostika - bez elevacije gde Windows politika dozvoljava**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" status
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" diagnostics
```

Zaštićeni nalog igrača nema opšti pristup CMD/PowerShell-u. Druge standardne Windows sesije mogu čitati bezbedan status; sve promene zahtevaju povišen administratorski token.

**Održavanje - povišen CMD, radi i bez backenda**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" maintenance enable
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" maintenance enable -Minutes 30
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" maintenance disable
```

Podrazumevani istek je 15 minuta, maksimum 60. Pre oslobađanja sopstvenih AppLocker pravila Client zaustavlja customer rad i odjavljuje Windows sesije samo izabranog igrača. Administratorska sesija ostaje dostupna. Igre instalirajte iz zasebne administratorske sesije. Održavanje ne ukida tuđe GPO/MDM/WDAC politike.

Ako je gaming sesija prekinuta održavanjem/recovery postupkom, njen ID ostaje lokalno blokiran, a status prijavljuje `SESSION_RECONCILIATION_REQUIRED`. Osoblje zatvara/usaglašava serverovu sesiju kroz postojeći autorizovani Gaming Sessions interfejs pre nastavka rada. Lokalni CLI ne menja naplatu, backend identitet ni poslovne podatke bez ovlašćenja. Najbolje je prethodno završiti gaming sesiju tim interfejsom.

Po isteku servis odmah vraća lokalno zaključano stanje; zaseban expiry task i recovery task ponavljaju povratak kada servis ne radi ili je računar bio ugašen. Standardni korisnik ne može pisati maintenance lease niti pozvati administratorski pipe bez povišenog tokena.

**Update, popravka i restart - administrator**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" update
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" repair
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" restart
```

Update zahteva server. Pri aktivnoj sesiji se odlaže; koristiti završenu sesiju ili lokalno autorizovano održavanje. Nema opcije za proizvoljan ZIP ili drugi server. HTTPS, SHA-256, potpisani file manifest i lokalni publisher/thumbprint pin proveravaju se pre zamene. Konfiguracija, DPAPI identitet, potpisani lease, command cursor i poslovno stanje ostaju u ProgramData. Binarni direktorijumi se menjaju kroz candidate/previous transakciju; neuspešan health signal vraća prethodne fajlove i konfiguraciju. Boot recovery nastavlja prekinut rollback. Repair/restart bez preuzimanja rade bez backenda; lokalni health razlikuje nedostupan backend od neispravne instalacije.

**Deinstalacija - administrator, server nije potreban**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" uninstall
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" uninstall -PurgeData
```

Uklanjaju se customer Shell/sesije, servis, svi G-Manager task-ovi, binarni direktorijumi i isključivo evidentirana G-Manager pravila/trust unosi. Default čuva lokalni identitet za ponovnu instalaciju. `-PurgeData` zahteva eksplicitno `OBRISI` i briše identitet, konfiguraciju i sesijsko stanje. Zaštićeni audit/policy journal i recovery alati ostaju kao trag oporavka. Backend stanica se ne briše. Ako rollback zapne, ostaje recovery task koji ponavlja završavanje deinstalacije.

**Emergency recovery - zaseban lokalni administrator, bez servera/Service-a**

Prijavite se zasebnim Windows administratorskim nalogom (po potrebi Ctrl+Alt+Del → promena korisnika). Recovery kopija nije u direktorijumu koji update menja:

```cmd
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File "%ProgramData%\GManager\Client\recovery\gmanagerctl.ps1" maintenance enable -Recovery
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File "%ProgramData%\GManager\Client\recovery\gmanagerctl.ps1" repair -Recovery
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File "%ProgramData%\GManager\Client\recovery\gmanagerctl.ps1" maintenance disable
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File "%ProgramData%\GManager\Client\recovery\gmanagerctl.ps1" uninstall
```

Audit: `management.jsonl`, `policy-events.jsonl`, `operational.jsonl`; transakcije: `deployment.json`, `policy-journal.json`, `uninstall.json`. Ne brišite journal pre završetka oporavka. Izmenjeno pravilo sa istim ownership GUID-em zaustavlja automatski rollback i traži razrešenje konflikta, bez brisanja administratorove izmene.

G-Manager čuva originalnu **lokalnu** AppLocker politiku i sopstvene GUID-eve; ne uvozi Effective/domain politiku u lokalni GPO, ne briše tuđa pravila, ne prepisuje Chrome/Registry politike i ne menja ACL-ove direktorijuma igara. Aplikacije moraju imati trust uslove i biti u direktorijumima koji nisu upisivi neprivilegovanom korisniku; nebezbedne putanje se odbijaju. Tuđa AuditOnly pravila zahtevaju administratorsku pripremu; ne uključuju se automatski.

Legacy instalacije starih skripti, koje su već globalno menjale Chrome/NTFS/AppLocker bez originalnog journal-a, zahtevaju administratorsko vraćanje iz originalnog backup-a. Installer to prepoznaje i odbija nagađanje izgubljenih prethodnih podešavanja; sačuvajte `identity.dpapi`. Nova instalacija i njene naredne reinstalacije/rollback koriste trajni ownership journal.

Backend šema mora uključiti migraciju `V41__client_management_telemetry.sql`. Stations prikazuje poslednje prijavljeno stanje i označava offline podatke. Pravo `STATION_READ` proverava backend; lokalno održavanje nema udaljeni flag za isključivanje zaštite.

Offline repair proverava instalirani potpisani file manifest i, ako su fajlovi oštećeni, koristi samo kompletnu pouzdanu kopiju iz prethodne instalacije ili zaštićenog update cache-a. Ako takva kopija ne postoji, potreban je novi potpisani Setup paket; nijedan zamenski paket se ne konstruiše. Rotacija pinovanog signing sertifikata/lokalnog CA radi se deinstalacijom bez `-PurgeData`, pa instalacijom novog pouzdanog izdanja uz očuvan identitet.


## Setup i zaseban administratorski panel

Pri sledećem potpisanom publish-u ZIP uključuje `GManager-Setup.cmd` i `GManager-Management.ps1`. Iz zasebne Windows administratorske sesije pokrenite `GManager-Setup.cmd` kroz **Run as administrator**. Setup redom prikazuje System Check, Server Configuration, Installation, Station Enrollment, Verification i Finish. Interaktivno prikuplja odobreni code-signing subject/thumbprint, postojeći standardni nalog igrača, javni Ed25519 policy ključ/key ID i HTTPS backend adresu; enrollment token se i dalje unosi skriveno i prenosi kroz stdin. Parametarski Setup ostaje podržan za postojeće deployment procedure. AllSigned, CMS/file manifest, pin izdavača i eksplicitna CA potvrda ostaju obavezni.

Posle instalacije, iz povišene administratorske sesije:

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" manage
```

Panel prikazuje verziju, Windows servis, poslednju potvrđenu backend vezu, postojanje enrollment identiteta, maintenance lease i update status. Dostupne su akcije Update, Restart, Exit, Enable/Disable Maintenance, Diagnostics i Uninstall. Panel odbija nalog igrača i ne koristi web OWNER/ADMIN ulogu kao Windows ovlašćenje. Sve promene izvršavaju postojeće lokalne CLI/pipe provere; korisnik ne može uneti proizvoljnu komandu ili zamenski update paket. Prozor ostaje otvoren dok traje operacija i prikazuje razumljiv rezultat.

`Exit Client` / `gmanagerctl.cmd exit` aktivira ograničeni maintenance lease, odjavljuje nalog igrača i zatvara Shell. Service ostaje aktivan u normalnom toku; expiry/recovery zadaci vraćaju zaštitu. Aktivnu gaming sesiju prethodno završite u autorizovanom web interfejsu. Prekinuta sesija ostaje blokirana za lokalni nastavak do usaglašavanja sa backendom.

Uninstall u panelu traži potvrdu i podrazumevano čuva identitet i konfiguraciju. Trajno brisanje zahteva poseban izbor, unos `OBRISI` i dodatni confirmation dialog. CLI `-PurgeData` zadržava interaktivnu potvrdu; panel prosleđuje `-PurgeConfirmation OBRISI` tek nakon lokalne eksplicitne potvrde. To nije kredencijal i ne zamenjuje obaveznu Windows administratorsku proveru.

Updater dodatno odbija promenu arhitekture u odnosu na instalirani potpisani manifest. Rollback prve instalacije vraća sopstvena Windows pravila pre uklanjanja recovery zadataka; neuspešan povratak zato ostaje ponovljiv.

Izvorne izmene ne ažuriraju raniji ZIP. Novo izdanje i dalje mora napraviti release administrator sa odobrenim code-signing sertifikatom preko `publish.ps1`. Instalaciju, AppLocker, restart stanice, update/rollback i deinstalaciju proveriti na namenskoj test stanici; razvojni računar nije korišćen za primenu tih Windows promena.

## Application policy i tri vrste signing materijala

1. Machine Ed25519 par nastaje na stanici; privatni ključ je u njenom DPAPI identity store-u, backend čuva javni ključ i key verziju.
2. Backend policy/lease Ed25519 par je zaseban: backend dobija Base64 PKCS#8 private key i key ID, Client samo odgovarajući Base64 X.509/SPKI public key i ID.
3. Windows code-signing sertifikat potpisuje paket, sopstvene izvršne fajlove i skripte; publisher/subject/thumbprint i CMS manifest čine distribucioni trust.

Ne kopirati nijedan private key u dokumentaciju ili Client paket. Backend nema automatski multi-key policy keyring: Client konfiguracija pin-uje jedan public key/key ID. Promenu planirati uz kompatibilnu Client konfiguraciju i proveru na stanici; machine identity overlap nije policy-signing key overlap.

Produkcioni cilj skripti je Windows 10/11 Enterprise/Education sa Application Identity/AppLocker podrškom i standardnim nalogom igrača. Home i unmanaged Pro nisu release cilj ovog procesa. Windows Server može služiti laboratoriji. Nema implementiranog TPM-backed identity store-a niti WDAC deploy adaptera; DPAPI i AppLocker su konkretna implementacija.

Profil eksplicitno navodi `LAUNCHER`, `GAME` i `HELPER` izvršne fajlove. Dozvoljeni launcher ne dozvoljava automatski child igru. Svaka putanja mora biti apsolutna, imati publisher ili SHA-256 trust uslov, opcion minimum file version, i nalaziti se u direktorijumu koji nije upisiv neprivilegovanom korisniku. Dependency group povezuje launcher, igre i helpers; Shell šalje application code, a putanje/argumente Service uzima iz verifikovanog snapshot-a.

`apply-policy.ps1` beleži originalnu **lokalnu** AppLocker politiku i owned rule GUID-eve pre izmene. Pravila targetuju samo odabrani player SID; scripts/MSI ostaju ograničeni. Tuđa pravila/GPO/MDM i administratorske sesije ostaju van Client ownership-a. Unsafe putanje se odbijaju; skripta ne popravlja automatski ACL igre. Politika sa manjom verzijom se ne vraća kao običan downgrade: pripremiti novu višu konfiguracionu verziju.

## Prekidi i oporavak

| Situacija | Implementirano ponašanje i operatorov postupak |
| --- | --- |
| Kratak prekid mreže | Poslednji verifikovani lease važi najdalje do `graceEndsAt` i nikad preko `sessionEndsAt`; monotoni tajmer i trusted UTC floor sprečavaju dobijanje dodatnog vremena |
| Istek lease/grace ili server outage | Production zatvara customer procese i zaključava prikaz; nema lokalnog produženja. Station ostaje nedostupna do ACK/reconciliation |
| Duplikat ili zakašnjela komanda | Cursor i pending ACK se čuvaju; već primenjena komanda se ne izvršava ponovo |
| Sequence gap | Ne preskakati cursor ručno; poll/reconnect mora doneti nedostajuću komandu |
| Istekla komanda | Backend je vraća sa `expired`; Client persistuje/ACK-uje sequence bez ponavljanja efekta i ne dozvoljava login pre potpisanog lease cursor-a |
| Restart Service-a/Windows-a | Učitava potpisano stanje, cursor, pending lock ACK i trusted UTC floor; proverava istek pre login/active prikaza |
| Neispravan potpis/ID/verzija | Fail closed; proveriti deployment ključa i pin-a, ne isključivati verifikaciju |
| Prekid update-a | Write-through journal i candidate/previous direktorijumi omogućavaju rollback; identity/config/recovery su izvan binarnog direktorijuma |
| Prekid uninstall-a | Recovery task ponavlja owned-policy restore i završavanje; ne brisati journal |

Gaming board „Ponovo pošalji force-lock” kreira novu ordered komandu, ali ne potvrđuje fizičko stanje. „Potvrdi fizički lock” koristiti samo posle stvarne provere da player desktop i procesi ne rade. Obe radnje imaju `station_reconciliation_audit` trag. Development nema fizičko sprovođenje ni fizički LOCK_ACK, pa njime ne sertifikovati produkcioni oporavak.

## Dashboard i lokalne preference

Shell prikazuje DashboardView samo za aktivnu, identifikovanu i neisteklu sesiju. MainWindow ostaje IPC granica: dashboard šalje application code ili logout, a Service ponavlja authorization/policy/lease proveru. Countdown koristi isti monotoni/server-offset izvor; lokalni prikaz ne produžava pravo na rad. Zakasneli status odgovor pokrenut pre korisničke akcije ne sme vratiti star ekran.

Dashboard koristi `Environment.MachineName`, ne potvrđeno backend ime/lokaciju stanice. Lokalni prikaz nema pouzdan početak/ukupno trajanje, stabilni customer ID ili image assets aplikacija; ne izmišlja vreme početka i ne prikazuje izveden procenat sesije. `ServerConnected` je opciona telemetry, ne authorization signal.

Preference su u `%LOCALAPPDATA%\GManager\Client\UiProfiles` ili development `UiProfiles`. Normalizovani login email se hash-uje radi izbora profila; bez opaženog login-a profil je session-scoped. Čuvaju se appearance/audio/notification podešavanja i approved application codes, ne email, lozinka, token, putanja aplikacije ili pravo na sesiju. Upisi su debounced/serialized/atomic; late load prethodne sesije se odbacuje, logout uklanja njen view state. Favorit ne može proširiti dozvoljenu listu.

Theme, neon intenzitet, density, countdown veličina, expiry alert i zvukovi su lokalni. Na manjoj širini grid smanjuje kolone i skroluje; ispod 1150 logical px desni panel se skriva, a detalji ostaju kroz Information. Produkcioni fullscreen/topmost/close ugovor pripada Shell-u, ne preference fajlu.

## Support i provera

Za ograničen support ZIP, iz elevated CMD-a gde Windows prava to zahtevaju:

```cmd
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File "%ProgramFiles%\GManager Client\support-bundle.ps1" -Output "C:\Support\GManager-Support.zip"
```

Output roditeljski direktorijum mora postojati. Skripta uzima service state, verzije/hash-eve, event metapodatke i poslednje operational zapise; pregledati ZIP pre deljenja. Ne uključuje `identity.dpapi` niti sirove session snapshot-e. Ne slati private keys ili customer credentials.

Automatske .NET provere i ručna acceptance matrica su u [TESTING.md](../development/TESTING.md) i [rollout vodiču](GAMING_CLIENT_PRODUCTION_ROLLOUT.md). Stvarni AppLocker, NTFS, reboot, network/power loss i game/anti-cheat ponašanje ostaju proverljivi tek na namenskom hardveru.
