# Operativni tok gaming stanica

Osoblje koristi `/gaming-sessions`. `GET /api/v1/gaming-operations/board` vraća samo stanice dozvoljene postojećim pravima i resource scope-om. OWNER/ADMIN imaju postojeći globalni pristup; EMPLOYEE koristi aktivne dodele resursa.

1. „Dodaj vreme“ evidentira već primljenu gotovinsku ili spoljnu POS uplatu za najmanje 30 celih minuta po aktuelnoj ceni. Ne aktivira računar.
2. „Dodeli računar“ povezuje registrovanog korisnika sa slobodnom, pripremljenom stanicom. `WAITING_FOR_LOGIN` ne troši vreme.
3. Korisnik se lozinkom prijavljuje na dodeljenom Windows Client-u. Backend aktivira `TIME_BALANCE` sesiju; Client proverava potpisani lease i redosled komandi pre pristupa.
4. Aktivna kartica prikazuje korisnika, početak, dozvoljeni kraj i preostalo vreme. Dopuna koristi isti trajni račun; ne postoji tarifna session-payment operacija.
5. Odjava, ručni završetak ili potrošen saldo završavaju pristup i pokreću zaključavanje. Preostalo vreme ostaje na nalogu za sledeću posetu.

Board zadržava postojeća stanja raspoloživosti, maintenance-a, greške Client-a, čekanja zaključavanja i pripreme privatnosti. Nova dodela ne zaobilazi readiness, potpisanu politiku ili potvrdu zaključavanja. Frontend ne računa autoritativnu potrošnju.

SSE događaji invalidiraju operativne upite; periodično osvežavanje ostaje oporavak posle prekida veze. Finansijska istorija aktuelnih uplata i zasebna istorijska arhiva dostupne su ovlašćenom osoblju. Stari novčani saldi nisu raspoloživo gaming vreme.

Detalji: [gaming vreme](../GAMING_TIME.md), [V51 i nadogradnja](../operations/GAMING_BILLING_RETIREMENT.md).
