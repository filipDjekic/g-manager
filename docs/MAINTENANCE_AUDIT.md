# Pregled dokumentacije i konfiguracionih nedostataka

Datum: **1. novembar 2026.** Obuhvat: postojeći Markdown fajlovi, frontend/backend kod i manifesti, profili, SQL migracije/seed, Docker/CI/release, backup i .NET Client packaging/recovery. Svi raniji Markdown fajlovi uključeni su u inventar sadržaja, naslova, putanja/linkova i duplikata. Istorijski zahtevi nisu korišćeni kao dokaz implementacije.

**Provera je statička.** Nisu pokretani build, testovi, Docker, serveri, seed, publish, instalacija ili Windows policy operacije. Nisu čitane stvarne `.env` vrednosti ili sadržaj lokalnog privatnog ključa. Aplikacioni kod, SQL, dependency manifesti i runtime/deployment konfiguracija nisu menjani.

## Kreirani dokumenti

| Dokument | Namena |
| --- | --- |
| [Indeks](README.md) | Redosled čitanja i izvori istine |
| [Arhitektura](architecture/OVERVIEW.md) | Komponente, komunikacija i granice obuhvata |
| [Lokalni razvoj](development/LOCAL_SETUP.md) | Host/Compose, bootstrap i signing priprema |
| [Testiranje](development/TESTING.md) | Suite-ove, komande i granice fixtures/protocol provera |
| [Konfiguracija](reference/CONFIGURATION.md) | Parametri, default-i, profili i secrets |
| [API](reference/API.md) | Controller rute i zajednički HTTP ugovori |
| [Bezbednost](reference/SECURITY_ACCESS.md) | Uloge, resource scope i trust granice |
| [Baza](reference/DATABASE.md) | MySQL, V1–V41 i održavanje šeme |
| [Deployment](operations/DEPLOYMENT.md) | Produkcija, release, bootstrap i rollback |
| [Backup/recovery](operations/BACKUP_RECOVERY.md) | DB alati i kompletan oporavak |
| [Troubleshooting](operations/TROUBLESHOOTING.md) | Dijagnostika svih komponenti |
| [Arhivski indeks](archive/README.md) | Istorijski materijal |
| Ovaj izveštaj | Promene, nepotvrđeno i nedostaci |

[Windows Client vodič](operations/WINDOWS_CLIENT.md) je nova centralna putanja za premešten i dopunjen raniji Client management dokument, sa spojenim policy/recovery/dashboard opisima.

## Ažurirani i spojeni dokumenti

Ažurirani su glavni [README](../README.md), [frontend README](../frontend/g-manager/README.md), [Client README](../client/README.md), [seed vodič](DEVELOPMENT_SEED.md), [module boundaries](architecture/MODULE_BOUNDARIES.md), ADR-003/004/005, svih šest [poslovnih/protocol ugovora](README.md#detaljni-ugovori-i-odluke), [CodeQL](operations/CODEQL_SETUP.md) i [Client rollout](operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md). ADR-001/002 ostaju važeća projektantska osnova.

- **49 dokumenata** premešteno je u `docs/archive/`: osam root G-Manager specifikacija/plan, dva različita scope dokumenta, šest roadmap dokumenata, deset stage izveštaja, devetnaest product-upgrade beleški, UX plan, dve ideje i prethodni audit. Svi imaju oznaku istorijskog statusa i aktuelne linkove.
- Identičan `gm/G-Manager-Plan-Izrade.md` uklonjen je kao duplikat; jedna kopija postoji u arhivi.
- `client/docs/CLIENT_MANAGEMENT.md` premešten je u `docs/operations/WINDOWS_CLIENT.md`.
- `client/POLICY.md`, `client/FAILURE_RECOVERY.md` i `client/docs/GAMING_DASHBOARD.md` uklonjeni su nakon spajanja korisnih informacija u centralni Client vodič.
- Relativni Markdown linkovi prilagođeni su novim putanjama. Stari nepostojeći UI `index.tsx` link popravljen je ka `index.ts`. Tekstualni primeri putanja unutar arhivskih code blokova ostaju istorijski kontekst, ne aktivne komande.

## Ispravljene tvrdnje

| Raniji opis | Potvrđeno stanje |
| --- | --- |
| Javna registracija | Register vraća 403; osoblje kreira kupca, jednokratni secret aktivira nalog |
| Fizički resursi/gaming/Client tek planirani | Postoje resursi, runtime sesije, machine API i Windows Service/Shell/packaging |
| PostgreSQL, Boot 3, MapStruct | MySQL 8.4, Spring Boot 4.1.2 i eksplicitno DTO mapiranje |
| Workflow i Documents stranica dostupni | Nema workflow modula/rute ili Documents SPA stranice; document backend ostaje aktivan |
| Svi document preview zahtevi privatni | Aktuelni CLEAN avatar/catalog image ima kontrolisan javni preview |
| Email i scanner produkciono kompletni | Email je sandbox, scanner proverava EICAR testni potpis |
| Location dodela dovoljna za gaming | Konkretan resource grant je autoritativan |
| Service ima virtual service nalog | Setup postavlja LocalSystem |
| Prod automatski migrira bazu | Flyway je isključen; potreban odvojeni migrator |
| Čist checkout dovoljan za jedan Docker start | Potreban ignorisani policy private-key fajl |
| Ranije uspešni testovi su aktuelni | Rezultati su istorijski; nijedna suite sada nije pokretana |

## Konfiguracioni i instalacioni nedostaci

Nalazi su zasnovani na fajlovima navedenim u povezanim vodičima. Posledice koje zavise od runtime okruženja nisu predstavljene kao izvršeni neuspešni testovi. Kod nije popravljan u dokumentacionom zadatku.

| Nalaz | Posledica / potrebna priprema |
| --- | --- |
| Root Compose ima samo root DB nalog/host port 3307; Spring default drugi nalog/3306 | Eksplicitni DB parametri za host start; promenljiva username sama ne kreira korisnika |
| Ignorisani policy key mount i obavezni entrypoint parametri | Čist checkout zahteva lokalnu pripremu, opisanu u razvojnom vodiču |
| Seed traži baš `owner@example.com` i kopira postojeći hash | Drugi bootstrap email ili naknadno izmenjena bootstrap lozinka ne daju očekivanu demo prijavu |
| Seed ne upisuje `user_resource_assignments`; V38 backfill je jednokratan | Posle seed-a ručno dodeliti resurse zaposlenima |
| Compose zahteva `BACKUP_FILE` pre nego što ga deploy izabere | Početna interpolacija može blokirati deploy; operatorska priprema je u deployment vodiču |
| Init/backup/restore hardkoduju `gmanager` | Secret DB username mora biti usaglašen; init ne popravlja postojeći volume |
| Prod Compose ne prosleđuje `INITIAL_OWNER_*` | Nova baza zahteva kontrolisan bootstrap override/provisioning |
| Secret fajlovi su 0600, procesi UID 10001; output je bind mount | Proveriti čitljivost/vlasništvo secrets i upis output-a, bez javnog otvaranja tajni |
| Rollback source-uje raw `env` release fajl | Vrednosti sa razmacima, posebno signer subject, mogu prekinuti rollback |
| Deploy serijalizuje sve exportovane `DOCUMENT_*` vrednosti | S3 access/secret key mogu završiti u release metadata ako se tako exportuju; koristiti secret fajlove, a wildcard treba suziti |
| Client artifact se ne objavljuje na download URL-u automatski | Potreban spoljašnji publishing korak pre deploy provere checksum-a |
| Release nema direktan gate na CI; staging rollback traži previous release | Potrebni repository/proces gate i plan za prvi staging release |
| Deploy/rollback/smoke imaju Git mode 100644, a release ih direktno izvršava | Linux checkout zahteva executable bit; deployment vodič daje pripremu, a verify/ci vodič eksplicitni Bash poziv |
| DB backup nema object backup, raspored ili off-host kopiju | Dopuniti storage backup, scheduler, alarme i realan restore drill |
| Alpine `mysql-client`/dump prava nisu izvršeni u pregledu | Kompatibilnost sa MySQL 8.4 i kompletan dump zahtevaju proveru |
| Restore backend nema obnovljene objekte i pokreće app proces | DB readiness nije kompletan recovery; izolovati kopiju i kontrolisati background poslove |
| Nginx nema eksplicitan upload body limit; koristi svoj `$scheme` | Proveriti usklađenost sa backend 5MB limitom i HTTPS edge forwarding-om |
| Prometheus target host:9091 ne odgovara automatski local/prod topologiji; nema Alertmanager-a | Prilagoditi privatni target/mrežu i isporuku alarma |
| Profili direktno postavljaju cookie Secure | `COOKIE_SECURE` iz osnovnog YAML-a sam ne menja profile override |
| Client pin-uje jedan policy public key/ID; implementira DPAPI/AppLocker | Nema automatskog policy keyring overlap-a, TPM store-a ili WDAC deployment-a |
| `PWA_OFFLINE` postoji u definicijama/store-u, ali ne u registration/cache proverama | Flag ne gasi stvarno offline ponašanje; ne predstavljati ga kao kill switch |

## Šta nije potvrđeno

- Uspešan start/build/test bilo koje komponente, aktuelni CI rezultat ili MySQL migracija na praznoj/prethodnoj produkcionoj bazi.
- Aktuelnost postojećeg ZIP-a/binarnih izlaza, validnost code-signing lanca, stvarna objava download URL-a i slaganje sa metapodacima.
- Produkcioni DNS/TLS, registry pristup, secrets, runner/environment zaštite, DB prava, S3 pristup i monitoring/backup raspored.
- Fizičko zaključavanje, AppLocker/NTFS/game/anti-cheat kompatibilnost, reboot/power-loss, update rollback i uninstall/reinstall na ciljnoj stanici.
- Potpun restore uparenih DB/objekata/ključeva, dostignuti RPO/RTO i point-in-time oporavak.

Za kasniju proveru koristiti [testiranje](development/TESTING.md), [deployment](operations/DEPLOYMENT.md), [backup](operations/BACKUP_RECOVERY.md) i [Client rollout](operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md).

## Završna statička provera

- Pregledan je konačni skup od 81 Markdown fajla, uključujući arhivu; 412 relativnih linkova i sekcijskih veza nema nedostajućih ciljeva.
- Provereno je očuvanje tela svih 49 arhiviranih dokumenata uz normalizaciju istorijske oznake, whitespace-a i premeštenih linkova.
- `git diff --check` prolazi. Sve promenjene, nove i uklonjene putanje imaju `.md` ekstenziju; nema promena aplikacionog koda ili konfiguracije.
- Navedene verzije, environment nazivi, controller rute, migracije i skriptne komande poređeni su sa repozitorijumom; nije tvrđena runtime verifikacija.
