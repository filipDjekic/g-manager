# Tehnička dokumentacija G-Manager-a

Aktuelni vodiči su usklađeni sa statički pregledanim kodom i konfiguracijom **1. novembra 2026.** Nisu pokretani build, testovi, Docker niti Windows instalacija. Komande su uputstva za kasnije izvršavanje; poznati blokatori su posebno navedeni.

## Redosled za novog programera

1. [Glavni README](../README.md): namena, implementirane funkcije i Quick Start.
2. [Arhitektura](architecture/OVERVIEW.md) i [granice modula](architecture/MODULE_BOUNDARIES.md).
3. [Lokalni razvoj](development/LOCAL_SETUP.md), [konfiguracija](reference/CONFIGURATION.md) i [baza](reference/DATABASE.md).
4. [API](reference/API.md) i [uloge/bezbednost](reference/SECURITY_ACCESS.md).
5. [Testiranje](development/TESTING.md), [deployment](operations/DEPLOYMENT.md), [backup/recovery](operations/BACKUP_RECOVERY.md) i [troubleshooting](operations/TROUBLESHOOTING.md).

Za gaming stanice pročitajte [Windows Client vodič](operations/WINDOWS_CLIENT.md) i [uslove pilot rollout-a](operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md). Demo podaci su u [seed vodiču](DEVELOPMENT_SEED.md), a postojeći CI gate u [CodeQL vodiču](operations/CODEQL_SETUP.md).

Aktuelni gaming billing ugovor je [trajno gaming vreme](GAMING_TIME.md). [Izmena V51](operations/GAMING_BILLING_RETIREMENT.md) opisuje uklanjanje starog operativnog sistema, očuvanje arhive i naknadne provere. Raniji rezultati merenja i arhivirani ugovori ne potvrđuju ovu izmenu.

## Korisnička uputstva

- [Centralni indeks i zajednički postupci](user-guides/README.md)
- [Vlasnik - OWNER](user-guides/OWNER.md)
- [Administrator - ADMIN](user-guides/ADMIN.md)
- [Zaposleni - EMPLOYEE](user-guides/EMPLOYEE.md)
- [Kupac / klijent - CUSTOMER](user-guides/CUSTOMER.md)
- [Najčešća pitanja i problemi](user-guides/FAQ.md)

Uputstva prate implementirane stranice, navigaciju, prava uloga i ograničenja pojedinačnih akcija. Ne zahtevaju poznavanje tehničkih ugovora ili razvojnog okruženja.

## Detaljni ugovori i odluke

| Tema | Dokument |
| --- | --- |
| Kreiranje i aktivacija kupca | [Customer onboarding](contracts/CUSTOMER_ONBOARDING.md) |
| Readiness stanice | [Station readiness](contracts/STATION_READINESS.md) |
| Gaming lifecycle | [Gaming session](contracts/GAMING_SESSION_LIFECYCLE.md) |
| Operativni board | [Gaming operations](contracts/GAMING_OPERATIONS_WORKFLOW.md) |
| Machine identitet i API | [Enrollment i protokol](contracts/MACHINE_ENROLLMENT_AND_PROTOCOL.md) |
| Command cursor i oporavak | [Command recovery](contracts/STATION_COMMAND_RECOVERY.md) |
| Protocol artefakti | [JSON schema](contracts/gaming-machine-protocol-v1.schema.json), [command fixture](contracts/fixtures/station-commands-v1.json) |
| Arhitektonske odluke | [ADR-001](architecture/decisions/ADR-001-MODULAR-MONOLITH.md), [ADR-002](architecture/decisions/ADR-002-EXPLICIT-MAPPING.md), [ADR-003](architecture/decisions/ADR-003-PHYSICAL-RESOURCE-SCHEDULING.md), [ADR-004](architecture/decisions/ADR-004-GAMING-SESSION-AGGREGATE.md), [ADR-005](architecture/decisions/ADR-005-MACHINE-TRUST-AND-REALTIME.md) |

## Izvori istine i održavanje

HTTP kontroleri, service authorization, migracije, runtime profili i instalacione skripte određuju ponašanje. Test fajl pokazuje scenario; rezultat testa postoji tek nakon izvršavanja. JSON schema i fixture pokrivaju deo protokola, pa pri promeni DTO-a treba proveriti i njihovu usklađenost.

Pri promeni funkcije ažurirati njen vodič i ugovor. Konfiguraciju pratiti u [CONFIGURATION.md](reference/CONFIGURATION.md), a šemu u [DATABASE.md](reference/DATABASE.md). Ne kopirati kompletan API ili environment tabelu u više README fajlova. Bootstrap tajne i signing materijal ostaju izvan dokumentacije.

[Izveštaj pregleda](MAINTENANCE_AUDIT.md) sadrži nalaze, ograničenja statičke verifikacije i evidenciju reorganizacije. [Arhiva](archive/README.md) čuva stare specifikacije, roadmap-e, stage izveštaje i ranije rezultate provera. Arhivski opis nije dokaz da funkcija danas postoji niti da su provere sada prošle.
