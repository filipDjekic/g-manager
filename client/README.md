# G-Manager Windows Client

.NET 10 solution sadrži Domain, Protocol, Windows Service, WPF Shell i testove. Instalirani Service radi kao LocalSystem i poseduje DPAPI machine identitet/policy; Shell i igre rade kao standardni Windows korisnik. Development je izdvojen režim bez fizičkih Windows restrikcija.

Razvoj, signed publish, Setup/enrollment, AppLocker policy, administratorski panel, maintenance, update/rollback, uninstall, recovery i dashboard objedinjeni su u [Windows Client vodiču](../docs/operations/WINDOWS_CLIENT.md).

- [Machine protokol](../docs/contracts/MACHINE_ENROLLMENT_AND_PROTOCOL.md)
- [Rollout i fizičke provere](../docs/operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md)
- [.NET provere](../docs/development/TESTING.md)
- [Indeks dokumentacije](../docs/README.md)

Promena izvora ne ažurira postojeći ZIP. Produkciono izdanje pravi `packaging/publish.ps1` sa odobrenim code-signing sertifikatom; private key i stvarne tajne ne pripadaju repozitorijumu.


### Lokalni Development Client

Pokretanje pripremljenih Debug executable datoteka (launcher ne radi build):

```cmd
client\packaging\start-development.cmd
client\packaging\stop-development.cmd
```

Backend mora ve? biti pokrenut. Compose profil `local` koristi eksplicitnu listu UUID stanica
`DEVELOPMENT_STATION_IDS` u lokalnom `.env` fajlu (odvojene zarezom). Ova lista ozna?ava
isklju?ivo testne stanice; ostaviti prazno za stvarne stanice. Posle promene liste backend
mora ponovo u?itati konfiguraciju. `DEV_READY` zna?i simuliranu spremnost komunikacije i
komandi, nikada potvrdu fizi?kog Windows zaklju?avanja. Produkcioni profil ne koristi listu.
Za prvi enrollment izdati uobi?ajeni jednokratni token za tu stanicu. Naredna pokretanja
?uvaju DPAPI identitet istog Windows korisnika. Odbijeni identitet se ne bri?e automatski.

Launcher ?ita postoje?i backend URL iz korisni?kog `client.json` (podrazumevano
`http://localhost:8080/`), Key ID i putanju privatnog klju?a iz lokalnog Compose fajla.
Iz privatnog klju?a izvodi samo javni klju?. Novi policy klju?evi se ne generi?u.

Eksplicitni lokalni recovery: `start-development.cmd -ResetState`. Service prvo proverava
potpisani lease i server snapshot i odbija reset dok postoji aktivna sesija. Prethodni
snapshot, policy, konfiguracija i dijagnostika arhiviraju se u
`%LOCALAPPDATA%\GManager\Development\archives`. Reset ponovo postavlja samo lokalni cache;
server command cursor, finansije i sesije ostaju netaknuti. Identitet se ?uva.
Zaustavljanje uklanja samo privremeni health i stop signal; arhive i identitet ostaju.

Dijagnostika: `BACKEND_UNAVAILABLE` / `BACKEND_TIMEOUT` ozna?avaju backend;
`SERVICE_NOT_STARTED` proces Service-a; `SHELL_CONNECTION_FAILED` lokalni Named Pipe;
`SIGNING_KEY_INVALID` / `SIGNATURE_REJECTED` signing konfiguraciju;
`ENROLLMENT_REQUIRED` / `ENROLLMENT_REJECTED` identitet;
`SERVER_STATE_ROLLBACK` vra?eno serversko stanje. `LOCK_PENDING` na webu zna?i da fizi?ko
zaklju?avanje jo? nije potvr?eno. Development nikada ne ?alje `LOCK_ACK`.
