# Spremnost gaming stanice

`PhysicalResource(GAMING_PC)` je kanonski identitet stanice. `GamingStationProfile` je 1:1 operativna konfiguracija; ne duplira naziv, lokaciju, mapu ili booking identitet resursa.

## Status i pristup

- `AVAILABLE`, `MAINTENANCE` i `RETIRED` su ručno upisiva stanja; `RETIRED` je terminalno.
- `IN_SESSION` se izvodi iz aktivne gaming sesije, a `OFFLINE` iz Client/heartbeat/grace podataka. Ne upisuju se ručno kao osnovni status.
- Booking/start proveravaju resurs, profil, raspoloživost i konkretne employee resource grant-ove. Maintenance/retired stanica je nedostupna.
- Operativni board dodatno projektuje `ACTIVE`, `EXPIRED` i `LOCK_PENDING` prema runtime/enforcement stanju. Backend readiness nije potvrda fizičke spremnosti stanice.

## Application policy

Application definition opisuje konkretan `LAUNCHER`, `GAME` ili `HELPER`, apsolutnu `.exe` putanju i publisher ili SHA-256 trust. Profile entry definiše redosled, auto-start, required-process, argument override i dependency group. Profil sadrži najmanje jednu GAME definiciju; izmena povećava configuration version.

Steam/Epic launcher ne daje implicitno pravo child igri. Profil mora navesti konkretne igre i helpers. Implementirani Windows Client preuzima potpisanu konfiguraciju preko `/api/v1/machine/configuration`, proverava pin/verziju/trust i sprovodi policy kroz Service/AppLocker. [Client vodič](../operations/WINDOWS_CLIENT.md) razdvaja development od fizičkog enforcement-a.
