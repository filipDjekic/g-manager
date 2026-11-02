# Pilot rollout Windows Client-a

Ovo su kriterijumi za proveru stvarnog izdanja na ciljnom MySQL okruženju i namenskoj upravljanoj Windows stanici. Izvorni kod, postojanje testova i raniji izveštaj ne predstavljaju potvrdu pilot spremnosti. Uputstva za rad su u [WINDOWS_CLIENT.md](WINDOWS_CLIENT.md), a konfiguracioni blokatori u [DEPLOYMENT.md](DEPLOYMENT.md).

## Infrastruktura i izdanje

- Backend/frontend image-i imaju nepromenljive digest reference, odgovarajući checkout migracija i uspešnu proveru šeme.
- Backend policy signing private key je u secret store-u; Client ima samo odgovarajući public SPKI key i key ID. Machine identity key i code-signing sertifikat su zasebni.
- Novi Client ZIP je Authenticode/CMS potpisan, stvarno objavljen preko HTTPS-a i odgovara `GAMING_CLIENT_VERSION`, minimum verziji, SHA-256 i signer subject-u. GitHub artifact sam ne objavljuje taj URL.
- Stanica ima DNS, važeći TLS chain, odvojene Windows admin/player naloge i podržan AppLocker/Application Identity. Service je **LocalSystem**, Shell radi kao standardni igrač. Putanje igara nisu upisive tom korisniku.
- MySQL, management i Prometheus ostaju privatni. Mrežni pristup backendu/download serveru i game servisima mora biti proveren iz stanice.

Za svako izdanje Windows-a zasebno popuniti [Home/Pro i Enterprise/Education acceptance matricu](WINDOWS_CLIENT_ACCEPTANCE.md). Capability i mock testovi nisu dokaz fizičkog enforcement-a.

## Funkcionalni i recovery dokazi

- [ ] Staff customer lookup/create/activation → gaming start → Client login → countdown → approved application → produženje → istek → fizički lock ACK → AVAILABLE.
- [ ] Parallel start, stale version, idempotency replay/425 i zabrana produženja terminalne sesije.
- [ ] Network loss kraći/duži od lease grace-a, server restart, Service restart, Windows reboot i sat unazad.
- [ ] Duplirane, istečene i out-of-order komande; cursor/pending ACK oporavak; nema ručnog pomeranja cursor-a.
- [ ] Launcher, konkretna igra, helper i anti-cheat rade; neodobren child i downloadovani izvršni/script fajlovi ostaju blokirani.
- [ ] Tampered policy/lease/manifest/ZIP, pogrešan key ID/publisher i unsafe putanja se odbijaju.
- [ ] Maintenance radi bez backenda, prekida samo player sesiju, ističe i vraća zaštitu čak i nakon reboot-a/Service outage-a; interrupted session traži reconciliation.
- [ ] Potpisani update, odlaganje tokom sesije, rollback pod greškom/prekidom, offline repair, uninstall/reinstall sa očuvanim identitetom i posebno provereno purge ponašanje.
- [ ] Owned AppLocker/trust restore čuva tuđa pravila; konflikt ili legacy instalacija bez backup-a zahteva administratorsko razrešenje.

## Bezbednost i operativa

[ops/security/machine-api-check.ps1](../../ops/security/machine-api-check.ps1) radi osnovnu neautentifikovanu proveru granice i header-a. Ne zamenjuje authenticated replay, wrong-station, rate-limit i malformed-payload provere. Za kasnije pokretanje iz korena:

```powershell
.\ops\security\machine-api-check.ps1 -BaseUrl https://staging.example/
```

Pregledati dependency/CodeQL/SBOM izveštaje i potpis paketa. Proveriti machine identity revoke/rotation i desetominutni overlap. Policy public pin i code-signing pin menjaju se zasebnim kontrolisanim postupkom; trenutni Client nije automatski policy multi-key keyring.

- [ ] Encrypted DB backup/restore uključuje session/machine tabele; vraćeni backend je ready, a zaseban object backup je potvrđen download/checksum proverom.
- [ ] Prometheus detektuje command lag, offline, lock-pending, expired-unacknowledged, enrollment/auth greške. Operativni kanal prima probni alarm; Alertmanager nije isporučen Compose-om.
- [ ] Support bundle je pregledan i ne sadrži identity DPAPI podatke, credentials ili session snapshot-e; incident beleži Support ID/request ID.
- [ ] Odgovorni operator je dokumentovao verziju, datum, ciljnu Windows/OS/game konfiguraciju, rezultate i recovery postupak pre šireg rollout-a.

Ne označavati ovu listu završenom samo na osnovu statičkog pregleda. Nisu potvrđeni aktuelni potpisani artefakt, stvarno objavljeni URL, ciljni hardware test ili produkcioni runner konfiguracija.
