# Upravljanje G-Manager Windows Client-om

Komande ispod pokreću se iz CMD-a. Zamenite vrednosti servera, javnog policy ključa, key ID-a, subject-a i thumbprint-a stvarnim deployment vrednostima. Privatni Ed25519 ključ ostaje isključivo na backendu.

**Razvojni laptop — bez administratora**

Potrebne su nove, prethodno pripremljene Service/Shell izvršne datoteke iz ovog izvornog koda. Skripta ne radi build. Stari binarni fajlovi bez `runtime-capabilities.json` se odbijaju. Framework-dependent razvojni izlaz zahteva odgovarajući .NET 10 Desktop Runtime; objavljeni self-contained izlaz ga sadrži.

```cmd
cd /d C:\putanja\g-manager
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "client\packaging\start-development.ps1" -BackendUrl "https://localhost:8443/" -PolicySigningPublicKey "%POLICY_PUBLIC_KEY%" -PolicySigningKeyId "%POLICY_KEY_ID%"
```

Opcije `-ServiceExecutable "C:\izlaz\service\GManager.Client.Service.exe" -ShellExecutable "C:\izlaz\shell\GManager.Client.Shell.exe"` biraju drugi već pripremljeni izlaz. Za lokalni backend dozvoljen je i loopback HTTP, npr. `http://localhost:8080/`. HTTPS zahteva normalno važeći sertifikat. Skripta traži jednokratni token samo kada razvojni identitet još ne postoji, pokreće Service skriveno i Shell u običnom prozoru; zatvaranje Shell-a zaustavlja taj razvojni Service.

Razvojni podaci su u `%LOCALAPPDATA%\GManager\Development`, zaštićeni DPAPI CurrentUser. Koristite zasebnu test stanicu i njen enrollment token iz postojećeg administratorskog interfejsa. Posle pripreme konfiguracije dozvoljeno je i ručno pokretanje oba EXE-a sa `--development`. Nema servisa, UAC zahteva, AppLocker/WDAC/Chrome/Registry/NTFS promena, Windows zaključavanja ili zatvaranja tuđih procesa. Istek zaključava samo Client prikaz. Razvojni Client ne šalje fizički LOCK_ACK. Instalirani produkcioni servis onemogućava razvojni režim i Service-a i Shell-a.

**Prvo izdanje i instalacija — administrator**

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

**Status i bezbedna dijagnostika — bez elevacije gde Windows politika dozvoljava**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" status
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" diagnostics
```

Zaštićeni nalog igrača nema opšti pristup CMD/PowerShell-u. Druge standardne Windows sesije mogu čitati bezbedan status; sve promene zahtevaju povišen administratorski token.

**Održavanje — povišen CMD, radi i bez backenda**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" maintenance enable
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" maintenance enable -Minutes 30
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" maintenance disable
```

Podrazumevani istek je 15 minuta, maksimum 60. Pre oslobađanja sopstvenih AppLocker pravila Client zaustavlja customer rad i odjavljuje Windows sesije samo izabranog igrača. Administratorska sesija ostaje dostupna. Igre instalirajte iz zasebne administratorske sesije. Održavanje ne ukida tuđe GPO/MDM/WDAC politike.

Ako je gaming sesija prekinuta održavanjem/recovery postupkom, njen ID ostaje lokalno blokiran, a status prijavljuje `SESSION_RECONCILIATION_REQUIRED`. Osoblje zatvara/usaglašava serverovu sesiju kroz postojeći autorizovani Gaming Sessions interfejs pre nastavka rada. Lokalni CLI ne menja naplatu, backend identitet ni poslovne podatke bez ovlašćenja. Najbolje je prethodno završiti gaming sesiju tim interfejsom.

Po isteku servis odmah vraća lokalno zaključano stanje; zaseban expiry task i recovery task ponavljaju povratak kada servis ne radi ili je računar bio ugašen. Standardni korisnik ne može pisati maintenance lease niti pozvati administratorski pipe bez povišenog tokena.

**Update, popravka i restart — administrator**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" update
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" repair
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" restart
```

Update zahteva server. Pri aktivnoj sesiji se odlaže; koristiti završenu sesiju ili lokalno autorizovano održavanje. Nema opcije za proizvoljan ZIP ili drugi server. HTTPS, SHA-256, potpisani file manifest i lokalni publisher/thumbprint pin proveravaju se pre zamene. Konfiguracija, DPAPI identitet, potpisani lease, command cursor i poslovno stanje ostaju u ProgramData. Binarni direktorijumi se menjaju kroz candidate/previous transakciju; neuspešan health signal vraća prethodne fajlove i konfiguraciju. Boot recovery nastavlja prekinut rollback. Repair/restart bez preuzimanja rade bez backenda; lokalni health razlikuje nedostupan backend od neispravne instalacije.

**Deinstalacija — administrator, server nije potreban**

```cmd
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" uninstall
"%ProgramFiles%\GManager Client\gmanagerctl.cmd" uninstall -PurgeData
```

Uklanjaju se customer Shell/sesije, servis, svi G-Manager task-ovi, binarni direktorijumi i isključivo evidentirana G-Manager pravila/trust unosi. Default čuva lokalni identitet za ponovnu instalaciju. `-PurgeData` zahteva eksplicitno `OBRISI` i briše identitet, konfiguraciju i sesijsko stanje. Zaštićeni audit/policy journal i recovery alati ostaju kao trag oporavka. Backend stanica se ne briše. Ako rollback zapne, ostaje recovery task koji ponavlja završavanje deinstalacije.

**Emergency recovery — zaseban lokalni administrator, bez servera/Service-a**

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

Backend/frontend deployment zahteva novu migraciju `V41__client_management_telemetry.sql`. Stations prikazuje poslednje prijavljeno stanje i označava offline podatke. Pravo `STATION_READ` proverava backend; lokalno održavanje nema udaljeni flag za isključivanje zaštite.

Offline repair proverava instalirani potpisani file manifest i, ako su fajlovi oštećeni, koristi samo kompletnu pouzdanu kopiju iz prethodne instalacije ili zaštićenog update cache-a. Ako takva kopija ne postoji, potreban je novi potpisani Setup paket; nijedan zamenski paket se ne konstruiše. Rotacija pinovanog signing sertifikata/lokalnog CA radi se deinstalacijom bez `-PurgeData`, pa instalacijom novog pouzdanog izdanja uz očuvan identitet.


## Setup i zaseban administratorski panel (audit izdanje)

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
