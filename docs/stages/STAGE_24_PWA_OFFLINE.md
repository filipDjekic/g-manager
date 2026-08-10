# Stage 24 — PWA, offline read i bezbedni draftovi

## Capability matrix

| Funkcija | Online | Offline |
|---|---|---|
| App shell i prethodno posećeni statički asseti | mreža + runtime cache | dostupni iz versioned shell cache-a |
| Catalog, working-hours i report definitions GET | server, zatim user-scoped snapshot | eksplicitno označen stale read-only snapshot ako postoji |
| Report generator draft | AES-GCM šifrovan IndexedDB zapis | može se dopuniti i pregledati |
| Login, refresh i privatni API odgovori | mreža | nisu u service-worker cache-u |
| Order/reservation/workflow/report mutacije | server potvrda obavezna | greška/offline poruka; nema queue-a ni lažnog success-a |

## Arhitektura i privatnost

`sw.js` ima minimalan same-origin allow-list: navigation shell i statičke script/style/font/image resurse. Ne presreće `/api/`, ne čuva Authorization header, refresh/access token ili privatni API response. Cache ime sadrži verziju; activation briše stare shell verzije.

Odabrani read-only odgovori čuvaju se u IndexedDB aplikacionom sloju, pod ključem koji uključuje ID prijavljenog korisnika. Offline odgovor je dozvoljen samo za tri eksplicitne GET putanje i emituje timestamp stale podatka. Draft je ograničen na neosetljiva polja generatora izveštaja, ima schema verziju i AES-GCM ključ koji nije extractable. Nepoznata verzija ili neuspešna dekripcija briše draft umesto rizične migracije.

Logout i promena korisnika brišu sve read snapshot-e, draft i ključ prethodnog korisnika, a service worker dobija `PURGE_PRIVATE`. Access/refresh tokeni ostaju van web storage-a. CSP ograničava sadržaj na same-origin resurse; backend odgovori imaju CSP, `X-API-Version: 1` i `Cache-Control: private, no-store`.

## Install, update i recovery

- Manifest: `/manifest.webmanifest`; scope/start URL su `/`, standalone prikaz.
- Service worker se registruje samo u production buildu. Nova verzija ne poziva automatski `skipWaiting`; korisnik dobija kontrolisanu poruku **Ažuriraj**.
- Aktivacija nove verzije uklanja prethodne `g-manager-shell-*` cache-e, čime se izbegava mešanje nekompatibilnih UI asseta.
- Offline banner jasno navodi da su podaci potencijalno zastareli i da slanje nije dostupno.
- Oporavljeni report draft zahteva pregled korisnika. Draft se briše tek nakon serverom potvrđenog pokretanja reporta ili eksplicitnog odbacivanja.
- Ako shell nije ranije uspešno posećen, prvi offline start nije moguć; korisnik mora jednom otvoriti production aplikaciju online.

## Operativni rollout

1. Deployovati novi frontend sa HTTPS-om; service worker nije dostupan na nesigurnom udaljenom origin-u.
2. Proveriti da su `sw.js` i `manifest.webmanifest` servirani sa root scope-a i bez dugog immutable cache-a za sam `sw.js`.
3. U DevTools Application proveriti manifest, installability, aktivni `g-manager-shell-v24-1` i odsustvo `/api/` unosa u Cache Storage-u.
4. Simulirati offline režim posle jednog online otvaranja: shell se otvara, stale read je označen, mutacija ne prikazuje success.
5. Pri rollback-u promeniti SW `VERSION`; activation će bezbedno ukloniti staru shell verziju.

## Verifikacija

Frontend testovi pokrivaju offline/stale status i postojeće mutation success tokove. Build potvrđuje manifest/SW assete. Backend test/build proveravaju Spring konfiguraciju; pregled headera potvrđuje ETag allow-list, API version, private/no-store i CSP politiku. Dva korisnika ne dele ključ jer svi privatni IndexedDB ključevi sadrže user ID i menjanje/logout poziva purge pre nastavka sesije.
