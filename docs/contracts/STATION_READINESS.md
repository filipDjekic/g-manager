# Gaming station readiness contract

`PhysicalResource(GAMING_PC)` je kanonski identitet stanice. `GamingStationProfile` je 1:1 operativna konfiguracija i ne duplira naziv, lokaciju, mapu ili booking identitet resursa.

## Status

- `AVAILABLE`, `MAINTENANCE` i `RETIRED` su jedina ručno upisiva stanja.
- `RETIRED` je terminalno stanje.
- `IN_SESSION` se izvodi isključivo iz aktivnog `GamingSession` projection porta; ne čuva se u station tabeli.
- `OFFLINE` se izvodi iz `clientEnabled`, poslednjeg heartbeat-a i offline grace politike; ne upisuje se ručno.
- Maintenance i retired stanica se odbijaju u backend booking proveri i prikazuju kao nedostupne na resource mapi.

## Application policy

Application definition opisuje konkretan `LAUNCHER`, `GAME` ili `HELPER` proces kroz apsolutnu Windows `.exe` putanju i najmanje publisher ili SHA-256 identitet. Profile entry dodaje redosled, auto-start, required-process i argument override. Profil mora sadržati najmanje jednu `GAME` definiciju i svaka izmena povećava `configurationVersion`.

Steam/Epic i sličan launcher nije dovoljan allowed-app ugovor: profil eksplicitno uključuje igre i potrebne helper/child procese. Budući Windows Client preuzima isti versioned profil; Stage 3 ne sadrži executable Client niti machine API.
