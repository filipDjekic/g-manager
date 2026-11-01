# G-Manager Windows Client

.NET 10 solution sadrži Domain, Protocol, Windows Service, WPF Shell i testove. Instalirani Service radi kao LocalSystem i poseduje DPAPI machine identitet/policy; Shell i igre rade kao standardni Windows korisnik. Development je izdvojen režim bez fizičkih Windows restrikcija.

Razvoj, signed publish, Setup/enrollment, AppLocker policy, administratorski panel, maintenance, update/rollback, uninstall, recovery i dashboard objedinjeni su u [Windows Client vodiču](../docs/operations/WINDOWS_CLIENT.md).

- [Machine protokol](../docs/contracts/MACHINE_ENROLLMENT_AND_PROTOCOL.md)
- [Rollout i fizičke provere](../docs/operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md)
- [.NET provere](../docs/development/TESTING.md)
- [Indeks dokumentacije](../docs/README.md)

Promena izvora ne ažurira postojeći ZIP. Produkciono izdanje pravi `packaging/publish.ps1` sa odobrenim code-signing sertifikatom; private key i stvarne tajne ne pripadaju repozitorijumu.
