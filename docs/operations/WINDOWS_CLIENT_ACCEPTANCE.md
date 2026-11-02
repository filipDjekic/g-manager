# Windows Client: Home/Pro acceptance

Status ove promene: implementacija i izolovane automatizovane provere postoje; fizički Home/Pro enforcement, potpisani release i gaming acceptance **nisu potvrđeni**.

## Zahtevi i granica podrške

Primarni cilj je Windows 10 22H2, build 19045, Home/Pro. Minimalni OS prag ostaje Windows 10 2004 / 19041; Enterprise/Education i postojeća Windows 11 izdanja koriste isti postupak. Microsoft navodi enforcement na svim izdanjima Windows 10 2004+ uz KB5024351 i na Windows 11: [zahtevi za AppLocker](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/requirements-to-use-applocker). Kumulativni update može zameniti KB; installer zato ne koristi naziv izdanja ili `Get-HotFix` kao dokaz.

Obavezne lokalne mogućnosti:

- 64-bitni Windows PowerShell 5.1 i odgovarajući `win-x64` / `win-arm64` paket; .NET runtime je self-contained.
- Ugrađeni `Get-AppLockerPolicy`, `Set-AppLockerPolicy`, `Test-AppLockerPolicy`, `Get-AppLockerFileInformation`, LocalAccounts i ScheduledTasks cmdlet-i.
- Čitljiva lokalna i efektivna AppLocker politika; stvarno sprovođenje Exe/Dll i aktivne Exe/Script/Msi/Dll/Appx kolekcije. GPO/MDM/WDAC konflikti ne smeju onemogućiti Shell ili oslabiti enforcement.
- AppIDSvc koji može biti pokrenut i podešen na Automatic, uključen `Microsoft-Windows-AppLocker/EXE and DLL` log i korelisani 8004 block događaji.
- Omogućen zaseban lokalni standardni nalog igrača, bez Administrators SID-a u tokenu, i zaseban administrator. Task Scheduler mora dozvoljavati S4U batch logon tog standardnog naloga; lozinka se ne čuva u Client-u.
- Validan potpisani paket, pouzdani signing/policy javni ključevi, normalna TLS validacija i zaštićene lokalne putanje aplikacija/DLL-ova.

Sistem bez obaveznih komponenti se odbija, uključujući Home sa AppIDSvc ali bez AppLocker PowerShell modula. Nema implementiranog ekvivalentnog SRP/Registry/WDAC fallback-a. Kopiranje Enterprise DLL-ova ili isključivanje TLS/potpisnih provera nije podržan postupak.

Read-only provera razvojnog računara tokom ove izmene: Windows 10 Home (`Core`), 19045.7807, AppIDSvc prisutan, AppLocker EXE/DLL log dostupan; sva četiri AppLocker cmdlet-a nedostaju. Ova konkretna konfiguracija **ne prolazi** compatibility gate. Na tom računaru nije primenjivana Windows politika niti pokretana instalacija.

## Matrica dokaza

Za svaki red sačuvati tačan build/UBR, izdanje, arhitekturu, Client verziju/potpis, datum, konfiguraciju igara i rezultate koraka ispod.

| Sistem | Izolovana capability/policy simulacija | Stvarna instalacija, enforcement i igre |
| --- | --- | --- |
| Windows 10 Home / CoreSingleLanguage, 19045 | Pokrivena | Nije izvršeno; lokalni Home capability gate je odbijen |
| Windows 10 Pro / Pro N, 19045 | Pokrivena | Nije izvršeno |
| Windows 10 Enterprise / Education, 19045 | Pokrivena | Nije izvršeno |
| Windows 10 Enterprise/LTSC, 19041+ | Pokrivena | Nije izvršeno |
| Windows 11 Home / Pro / Enterprise / Education | Pokriveni capability uslovi | Nije izvršeno |
| Nedostajuće komponente, AuditOnly, izmenjena/odsutna efektivna pravila | Negativni testovi prolaze | Negativni VM acceptance obavezan |

`dotnet test client/GManager.Client.slnx -c Release` uključuje PowerShell suite bez Pester zavisnosti. Samostalno: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File client/tests/windows-enforcement.Tests.ps1`. Windows API-ji su u testovima mockovani; testovi pišu samo u privatne privremene direktorijume. Ovo ne potvrđuje kernel enforcement, Appx aktivaciju, NTFS na gaming instalaciji ili fizički LOCK_ACK.

## Fizički postupak na namenskoj stanici

1. Napraviti VM snapshot / backup stanice, zasebne admin/player naloge i validan backend profil sa konkretnim launcherom, igrom i helperima. Sačuvati originalnu lokalnu AppLocker politiku i AppIDSvc startup. Dodati sopstveno bezazleno pravilo drugog vlasnika da bi se proverilo očuvanje tuđih politika. Ne koristiti produkcionog igrača za ove probe.
2. Napraviti novi potpisani ZIP kroz `client/packaging/publish.ps1`; proveriti Authenticode i CMS/file manifest. Raspakovati i pokrenuti `GManager-Setup.cmd` kao administrator. Uneti odobrene javne ključeve/server i jednokratni enrollment token. Pogrešan TLS chain, signer, hash, token ili policy ključ moraju biti odbijeni; bez prebacivanja na HTTP ili preskakanja validacije.
3. Sistem sa nedostajućim cmdlet-om/AppIDSvc-om, onemogućenim event log-om, zabranjenim S4U logon-om ili efektivnim AuditOnly pravilima mora prijaviti konkretnu grešku. Enrollment ne sme početi kada preflight nije prošao. Greška posle binary/policy write-a mora ostaviti rollback/recovery journal, bez `INSTALL_COMPLETE`.
4. Na sposobnom sistemu installer mora završiti stvarnu S4U probu. U `enforcement-verification.json` zahtevati `verified=true`, odgovarajući boot/SID/build/verziju; u AppLocker log-u proveriti dva 8004 događaja za isti probe nonce i player SID, jedan EXE i jedan DLL. Task start error, file-not-found i AuditOnly događaji 8003 nisu uspeh. Privremeni probe task/fajlovi i EXE izuzeci moraju nestati; `Test-AppLockerPolicy` za Service EXE i `whoami.exe` pod player SID-om mora biti Denied.
5. Restartovati Windows. Proveriti Automatic LocalSystem Service, recovery task i Shell task pri player logon-u, sa Limited principal-om. Pre gaming prijave igrač ne sme pokrenuti igru, Explorer, Task Manager, CMD, Windows PowerShell, `pwsh`, WSH, `mshta`, `rundll32`, `msiexec` ili Store/Calculator packaged app. Ponoviti dostupne x86 i x64 hostove. Kopirani/renamovani EXE u Downloads, USB, temp ili drugom user-writable direktorijumu mora biti blokiran; isto važi za `.cmd`, `.ps1`, `.vbs`, `.js`, `.msi` i DLL payload.
6. Otvoriti sesiju kroz postojeći staff/backend tok i prijaviti kupca u Shell. Proveriti countdown, dozvoljeni launcher, konkretnu igru, helper i anti-cheat. Drugi launcher child, preuzeti EXE i neodobren DLL moraju ostati blokirani. Writable/reparse/UNC/ADS putanja ili pogrešan hash/publisher moraju odbiti konfiguraciju/prijavu. Launcher nije opšta dozvola svim njegovim igrama.
7. Produžiti sesiju, zatim sačekati istek: igre/helpers se zaustavljaju, preostalo vreme postaje nula, OS izvršavanje se blokira i fizički LOCK_ACK odlazi tek posle uspešne politike. Prekinuti backend mrežu kraće i duže od potpisanog grace-a; session end uvek mora imati prednost. Restartovati backend i proveriti cursor/pending ACK usaglašavanje. Pomeranje sata unazad ne sme produžiti lease.
8. Tokom zaključane i aktivne sesije testirati SCM restart, nasilni Service exit, Shell exit, reboot i prekid napajanja. Proveriti restart/recovery zadatke, ponovno sprovođenje politike, neautomatski nastavak prethodnog login-a i očuvan DPAPI identity/cursor. Zabeležiti stvarno vreme oporavka i proveriti da igra ne ostaje upotrebljiva preko isteka sesije; svaki takav rezultat blokira rollout.
9. Iz admin sesije bez mreže pokrenuti Enable Maintenance / Exit Client. Player sesija se odjavljuje, igre ostaju zabranjene, a administrator može raditi. Zatim Disable Maintenance i automatski istek od jednog minuta (`maintenance enable -Minutes 1`). Ponoviti sa Service-om koji ne radi i sa reboot-om pre isteka. Zaštita mora ostati prisutna tokom održavanja, a prekinuti session ID mora zahtevati reconciliation.
10. Testirati Update Client sa potpisanim novijim paketom i odlaganje tokom aktivne sesije. Simulirati grešku health-a i prekid napajanja pre/posle zamene `candidate/previous` i oba policy write-a. Prethodni fajlovi i konfiguracija moraju biti vraćeni, identitet očuvan, a oporavljena stanica zaključana. Testirati `repair -Recovery` bez backenda.
11. Uninstall bez purge-a mora ukloniti samo G-Manager pravila, task-ove, fajlove i evidentirane trust/startup izmene; tuđe lokalno pravilo i GPO/MDM moraju ostati. Uporediti rule GUID-eve i collection modes sa baseline-om. Ako zaštićeni AppIDSvc odbije SCM promenu, zahtevati journal `serviceRestoreNeedsReboot=true`, odgovarajuću poruku i proveriti originalni startup posle reboot-a; ne zaustavljati ga prisilno. Reinstall mora koristiti isti `identity.dpapi`. Zasebno testirati potvrđeni purge i novi enrollment. Izmena owned pravila od drugog administratora mora izazvati konflikt, bez brisanja te izmene.

## Poznata ograničenja

Home/Pro bez neophodne policy infrastrukture ne mogu pouzdano raditi sa ovom implementacijom i instalacija se prekida. Uspešan build ili naziv Windows izdanja ne menjaju taj rezultat. Nisu implementirani TPM identity store, WDAC adapter ili zamena za odsutan AppLocker modul.

Protokol autorizuje konkretne EXE fajlove; ne podržava player Appx igre niti proizvoljne skripte, MSI instalere ili opšte command/runtime hostove kao igre. Takvi hostovi se odbijaju i kada imaju validan potpis. Game direktorijumi/DLL zavisnosti moraju biti zaštićeni od player upisa; potrebne dodatne DLL lokacije, launcher update-i i anti-cheat ponašanje zahtevaju ovaj acceptance postupak. Lokalni administrator ostaje izvan player granice zaštite.

Home/Pro podršku označiti potvrđenom tek posle uspešnog potpisanog izdanja i svih fizičkih koraka na konkretnom ciljnom izdanju/build-u.

Microsoft posebno opisuje zaštitu AppIDSvc servisa i ograničenje vraćanja na Manual preko `sc.exe`: [Application Identity konfiguracija](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/configure-the-application-identity-service). G-Manager pri uninstall-u može vratiti sopstvenu startup Registry vrednost za sledeći boot; to nije zamena za nedostajuću AppLocker policy infrastrukturu. Ovaj slučaj takođe zahteva fizičku proveru.

## Fajlovi ove izmene

| Oblast | Izmenjeni ili dodati fajlovi |
| --- | --- |
| Setup, release i upravljanje | `client/packaging/GManager-Setup.ps1`, `client/packaging/GManager-Management.ps1`, `client/packaging/client-management.ps1`, `client/packaging/gmanagerctl.ps1`, `client/packaging/publish.ps1`, `client/packaging/uninstall-service.ps1` |
| Service i enforcement | `client/src/GManager.Client.Service/ClientRuntime.cs`, `StationPolicyEnforcer.cs`, `Program.cs`, `GManager.Client.Service.csproj`, `apply-policy.ps1`; novi `ApplicationExecutionPolicy.cs`, `WindowsEnforcementProbe.cs`, `windows-enforcement.ps1` u istom direktorijumu |
| Testovi | `client/tests/GManager.Client.Tests/WindowsCompatibilityTests.cs`, `client/tests/windows-enforcement.Tests.ps1`, `client/tests/windows-policy-transaction.Tests.ps1` |
| Dokumentacija | `docs/development/TESTING.md`, `docs/operations/WINDOWS_CLIENT.md`, `docs/operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md`, `docs/operations/WINDOWS_CLIENT_ACCEPTANCE.md` |

`install-service.ps1` i `update-client.ps1` zadržavaju postojeće entry point-e i koriste izmenjeni zajednički deployment/health/recovery mehanizam. WPF korisnički tok, backend API, TLS validacija, enrollment i postojeći DPAPI identiteti nisu menjani.
