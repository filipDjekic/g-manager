# Gaming vreme, naplata i sesije

Osnovni tok je **Dodaj vreme → Dodeli računar → Završi sesiju**.

## Podešavanje i naplata

OWNER/ADMIN prvo u Podešavanja → Gaming vreme postavlja cenu po minutu u RSD. Cena nema podrazumevanu vrednost. Bez podešene cene uplata nije dozvoljena.

Osoblje u profilu klijenta, ili preko dugmeta „Dodaj vreme“, unosi najmanje 30 celih minuta. Dozvoljeni su i 31, 45, 90 i drugi celi brojevi minuta. Prozor prikazuje raspoloživo vreme, cenu i novo stanje. Posle prijema novca na kasi radnik bira „Potvrdi uplatu“.

Backend računa cenu kao `minuti × cena po minutu` koristeći decimalnu aritmetiku. Zahtev sadrži samo minute i verziju cene. Promenjena cena zahteva pregled novog iznosa pre potvrde. Jedna transakcija upisuje uplatu, audit, stavku vremena i saldo. `Idempotency-Key` i trajno jedinstven izvor u evidenciji sprečavaju duplu dopunu, uključujući ponavljanje nakon isteka keša odgovora.

Istorija uplata je zaseban pregled za ovlašćeno osoblje. Zaposleni vidi finansijske stavke svojih dodeljenih resursa. Stare finansijske operacije i audit ostaju sačuvani. Stari API-ji za tarife, pakete, novčane dopune, korekcije i neposredno pokretanje sesije uklonjeni su iz aktivnog API-ja.

## Dodela i igranje

Dodela vezuje slobodan računar za konkretnog registrovanog korisnika sa pozitivnim saldom. Ne kreira aktivnu gaming sesiju i ne troši vreme. Rok za prijavu je konfigurisan preko postojećeg `app.gaming-session.login-timeout-seconds` (podrazumevano 300 sekundi).

Samo dodeljeni korisnik može potvrditi prijavu lozinkom na toj stanici. Client proverava novi potpisani lease, konfiguraciju i redosled komandi pre pristupa Windows okruženju. Backend koristi postojeću gaming sesiju i evidenciju komandi. Jedinstvena ograničenja i zaključavanje korisnika/stanice/sesije sprečavaju istovremene sesije i dvostruki obračun.

Saldo se čuva u sekundama. Potrošnja teče samo tokom aktivne sesije, kumulativno u celim sekundama. Dopuna tokom igranja odmah povećava saldo i produžava dozvoljeni kraj, uz postojeća ograničenja rezervacija i radnog vremena.

Završetak preko Clienta, korisnikovog web naloga ili osoblja obračunava protekle sekunde, završava sesiju i šalje trajnu komandu zaključavanja. Preostalo vreme ostaje na nalogu bez kalendarskog isteka. Nova prijava zahteva novu dodelu.

## Windows Client i oporavak

Client izlaže stanja `LOCKED_FREE`, `ASSIGNED`, `ACTIVE` i prelazno `LOCKING` preko postojećeg lokalnog prikaza i health evidencije. Lokalno zaključavanje pri odjavi prethodi mrežnoj potvrdi, uključujući neuspešnu obnovu machine tokena.

Pri prekidu veze pristup traje najduže do isteka poslednjeg potpisanog lease-a; za saldo vremena nema dodatnog offline grace perioda. Backend obračunava najdalje do te granice. Posle restarta Client zatvara staru aktivaciju i usaglašava komande dok je lokalno zaključan. Stari lease ne može sam ponovo otključati računar.

Postojeće provere Windows politike, potpisa, fizičke potvrde zaključavanja i privatnosti profila ostaju obavezne. Završena stanica postaje raspoloživa za ponovnu dodelu tek kada su te provere zadovoljene. Development simulacija ne predstavlja fizičku potvrdu zaključavanja.

## Migracija

Originalni `V48` prenosi tada raspoložive minute i zatvara stari pristup. Njegov distribuirani SQL i checksum ostaju nepromenljivi. `V49` dodaje nepodešenu cenu i snimak cene/verzije uz nove uplate. `V50` dodaje isključivo minute iz istorijskih paketa koje originalni V48 nije preneo zbog roka isteka, uz jedinstveni izvor i bez ponovnog dodavanja već prenetog vremena.

Stari novčani saldi ostaju finansijska istorija; ne pretvaraju se proizvoljno u vreme. Aktuelni postupak, ograničenja nadogradnje i kontrola checksum-a opisani su u [Flyway oporavku](operations/FLYWAY_RECOVERY.md). Pri rollout-u koristite postojeće procedure za backup i usaglašeno zaustavljanje starih backend/Client verzija.

## Provere

`GamingTimeIntegrationTest` pokriva dopune, cene, uloge, idempotentnost, konkurentne operacije, dodelu, prijavu, preciznu potrošnju, dopunu tokom igranja, završetak, istek, granice rezervacija i restart. `GamingTimeMigrationTest` proverava nadogradnju postojeće baze na H2; `GamingTimeMigrationIT` i `GamingTimeMySqlIT` proveravaju MySQL preko Testcontainers. Client testovi proveravaju potpisanu aktivaciju, lokalno zaključavanje, prekid veze i oporavak. Fizičku AppLocker/Windows logoff proveru izvršite na instaliranoj gaming stanici.

Rezultat provere 6. novembra 2026:

| Provera | Rezultat |
| --- | --- |
| Backend `verify` i MySQL regresija (komanda u Flyway izveštaju) | 289 testova i 23 MySQL integracione provere prošle; build, Checkstyle i coverage provera prošli |
| Frontend `npm run test` | 222 testa prošla |
| Frontend `npm run build`, `npm run lint` | Prošli |
| Windows Client `dotnet test` | 73 testa prošla |
| Windows Client Release build | Prošao, bez upozorenja i grešaka |
| Playwright: plaćanje za tri uloge i dodela računara | 8 provera prošlo na desktopu i mobilnom prikazu |
| Nadogradnja V47/V48/V49 → V50, saldi i ponovljena migracija | Pokrivena zajedničkim H2/MySQL testovima, uključujući minute sa starim rokom |

Rezultati naknadne MySQL/Flyway provere i oporavka postojeće baze nalaze se u [Flyway izveštaju](operations/FLYWAY_RECOVERY.md). Fizičko zaključavanje na instaliranoj gaming stanici nije provereno ovim automatizovanim testovima. Logovi provera nalaze se u lokalnom direktorijumu `artifacts/gaming-*`.
