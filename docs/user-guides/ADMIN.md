# Uputstvo za administratora - ADMIN

[Indeks uputstava](README.md) · [Vlasnik](OWNER.md) · [Zaposleni](EMPLOYEE.md) · [Kupac](CUSTOMER.md) · [FAQ](FAQ.md)

Administrator vodi operativni rad i uređuje ponudu, prostor, radno vreme i zaposlene. Većina postupaka zajednička je sa vlasnikom, pa su ispod povezani tačni odeljci sa koracima. Ograničenja administratora prema vlasniku posebno su navedena i imaju prednost pri korišćenju zajedničkih postupaka.

## Prvi ulazak i navigacija

Administratorski nalog kreira vlasnik i predaje vam email i početnu lozinku. Koristite [prijavu i odjavu](README.md#prijava-i-odjava). Svoje ime, avatar, lozinku, prijavljene uređaje i obaveštenja uređujete kroz **„Moj nalog“**, prema [zajedničkom uputstvu](README.md).

Bočni meni sadrži **„Pregled“**, **„Radni ekran“**, **„Rezervacije“**, **„Narudžbine“**, **„Klijenti“**, **„Oprema“** i **„Upravljanje“**. U „Oprema“ nalaze se **„Prostor i resursi“** i **„PC konfiguracija“**. U „Upravljanje“ nalaze se **„Tim i pristup“**, **„Ponuda i cene“**, **„Rad igraonice“**, **„Izveštaji“** ako su uključeni i **„Evidencija promena“**.

Po prijavi proverite „Zahteva pažnju“, rezervacije na čekanju, nepreuzete narudžbine i PC stanice za proveru. **„Otvori pregled“** vodi na listu gde možete rešiti pojedinačnu stavku.

## Razlike u odnosu na vlasnika

| Oblast | Administrator | Vlasnik |
| --- | --- | --- |
| Novi nalog osoblja | Kreira samo zaposlenog | Kreira zaposlenog i administratora |
| Deaktiviranje, brisanje i vraćanje kroz „Korisnici i uloge“ | Samo naloge zaposlenih | Naloge koji nisu vlasnički, uz zaštitu sopstvenog naloga |
| Klijentski nalozi kroz „Klijenti“ | Kreiranje, izmena imena/email-a i deaktiviranje | Isti postupci |
| Evidencija promena | Upravljački zapisi | I upravljački i zapisi namenjeni samo vlasniku |
| Početni „Pregled“ | Ističe današnju operativu, zahteve i aktivne narudžbine | Ističe stanje igraonice i poslovne rezultate |
| Stanice, rezervacije i gaming operativa | Sve dozvoljene stanice, bez pojedinačne dodele zaposlenom | Isti opseg |
| Izveštaji i rasporedi | Svoje generisane izveštaje, šablone i rasporede | Svoje generisane izveštaje, šablone i rasporede |

Administrator ne upravlja nalogom vlasnika niti drugim administratorom kroz opšte akcije nad korisnicima. To što vidi njihov red u listi ne daje pravo izmene. Ne može sebi promeniti ulogu. Za kupce koristite poseban tok „Klijenti“; ograničenje opšteg upravljanja korisnicima nije zabrana kreiranja klijenata.

## Tim, korisnički nalozi i pristup stanicama

**Namena:** dodavanje zaposlenih i određivanje kojim resursima mogu da upravljaju. **Mesto:** „Upravljanje“ → „Tim i pristup“.

1. Na „Zaposleni“ kliknite **„Novi zaposleni“**.
2. Unesite ime, email i početnu lozinku, pa **„Dodaj zaposlenog“**. Predajte mu podatke za prijavu.
3. Otvorite profil zaposlenog. Za grupnu dodelu postojećih resursa lokacije koristite **„Dodeli lokaciju“ → „Potvrdi dodelu“**.
4. U „Oprema“ → „Prostor i resursi“ na konkretnom resursu otvorite **„Zaposleni na resursu“** i proverite **„Dodeli stanicu“ / „Ukloni pristup“**.
5. Proverite i svaki novi računar dodat posle dodele lokacije: nije automatski dodeljen ranije izabranim zaposlenima.

**Rezultat:** zaposleni ima nalog i odvojeno definisan opseg rada. Pogledajte [detaljan postupak za zaposlene i naloge](OWNER.md#zaposleni-administratori-i-korisnički-nalozi) za filtere, profil, grupno deaktiviranje, brisanje sa razlogom i vraćanje obrisanih zaposlenih. U odeljku **„Nalozi i obrisani“ → „+ Novi korisnik“** vaša uloga je ograničena na zaposlenog, iako uvodni tekst prozora pominje i administratora.

**Ograničenja:** neaktivan zaposleni ne dobija novu aktivnu dodelu. Deaktiviranje naloga nije evidentiranje završene smene. Nema korisničkog uređivača pojedinačnih privilegija ni proizvoljne promene postojeće uloge. Ako zaposleni vidi „Samo pregled“, prvo proverite konkretan resurs i njegovu aktivnu dodelu.

## Svakodnevna operativa

Sledeći postupci iz uputstva zaposlenog važe i za administratora, uz širi opseg:

| Posao | Gde i kako započeti | Detaljni koraci i rezultat |
| --- | --- | --- |
| Klijenti | „Klijenti“ → „Novi klijent“ ili postojeći profil | [Kreiranje, kod, profil i deaktiviranje](EMPLOYEE.md#rad-sa-klijentima) |
| Rezervacije | „Rezervacije“ → „Raspored“ ili „Lista“ → „Nova rezervacija“ | [Kreiranje, potvrda, premeštanje, otkazivanje i serije](EMPLOYEE.md#kalendar-i-rezervacije) |
| Lista čekanja | „Rezervacije“ → „Čekanje“ → „Dodaj na listu čekanja“ | [Prijave, izmene i automatske ponude](EMPLOYEE.md#lista-čekanja) |
| Gaming sesije | „Radni ekran“ → spreman računar → „Pokreni sesiju“ | [Start, produženje, završetak i oporavak](EMPLOYEE.md#gaming-sesije) |
| Narudžbine | „Narudžbine“ → „Nepreuzete“ | [Priprema i preuzimanje proizvoda](EMPLOYEE.md#obrada-narudžbina) |

Možete upravljati rezervacijama svih resursa. Ako obavezni resurs nedostaje, u detaljima odaberite **„Slobodan računar / resurs“** i **„Dodeli resurs“**, pa proverite mogućnost potvrde. Nedostupan termin, odsustvo zaposlenog ili preklapanje i dalje sprečavaju čuvanje.

Kod narudžbina možete nastaviti obradu i kada je druga osoba već zadužena i možete otkazati narudžbinu koja je spremna za preuzimanje. Završene i otkazane narudžbine ostaju završene. Nema uređivanja poslatih stavki, prenosa zaduženja ili naručivanja umesto kupca kroz korpu.

U profilu klijenta imate **„CRM“**: tagove i interne beleške uređujete prema [CRM postupku](OWNER.md#klijenti-i-interne-beleške). Zaposleni i kupci nemaju ovu karticu.

## Ponuda, oprema i rad igraonice

| Oblast | Ulaz i najvažnija akcija | Postupak |
| --- | --- | --- |
| Usluge, proizvodi i cene | „Upravljanje“ → „Ponuda i cene“ → „Nova stavka“ | [Dodavanje, slike, aktiviranje, brisanje i vraćanje](OWNER.md#ponuda-usluge-i-cene) |
| Lokacije, zone i oprema | „Oprema“ → „Prostor i resursi“ → „Upravljaj prostorom“ | [Prostor, mapa i dodele](OWNER.md#lokacije-zone-resursi-i-mapa) |
| Radno vreme i posebni datumi | „Upravljanje“ → „Rad igraonice“ | [Nedeljni rad, izuzeci i odsustva](OWNER.md#radno-vreme-izuzeci-i-odsustva) |
| PC konfiguracija | „Oprema“ → „PC konfiguracija“ | [Aplikacije, profili, Client paket i upis](OWNER.md#pc-konfiguracija-i-povezivanje-gaming-client-a) |

**Rezultat:** iste administrativne promene kao kod vlasnika, ako sistem dozvoli izabranu radnju. Posebno proverite:

- Za privremenu intervenciju koristi se „Održavanje“. „Van upotrebe“ ne može se vratiti u aktivno stanje kroz ovaj interfejs.
- Čuvanje profila stanice ne znači da je Windows klijent već povezan, bezbedno zaključan ili primenio pravila.
- Kod za upis ili rotaciju vidljiv je samo u otvorenom prozoru. Pre zatvaranja ga preuzmite i predajte osobi koja održava stanice.
- Odobreno odsustvo blokira dostupnost zaposlenog; ne predstavlja planiranje smena. Promena radnog vremena nije automatsko otkazivanje postojećih rezervacija.

## Analitika, izveštaji i evidencija

U **„Pregled“ → „Analitika“** birate period, proveravate poslovne pokazatelje i opterećenje, izvozite CSV i čuvate lični raspored grafikona. Postupak je opisan u [poslovnom pregledu](OWNER.md#poslovni-pregled-i-analitika). Prihod potiče od završenih narudžbina; ekran ne obračunava naplatu gaming minuta.

U **„Upravljanje“ → „Izveštaji“** možete generisati CSV/XLSX/PDF, sačuvati šablon i zakazati automatsko generisanje. Pratite [postupak za izveštaje](OWNER.md#izveštaji-i-automatsko-generisanje). Završni datum perioda nije uključen; šablon i raspored pamte fiksne datume. Istorija, šabloni i rasporedi pripadaju vašem nalogu, pa to nije lista svih vlasnikovih izveštaja. „Izveštaji“ mogu biti isključeni; opcioni „AI sažetak“ podrazumevano je isključen.

U **„Upravljanje“ → „Evidencija promena“** pretražite ili filtrirajte događaje i otvorite detalje. Pogledajte [postupak pregleda evidencije](OWNER.md#evidencija-promena-i-granice-podešavanja). Administrator vidi samo upravljačke zapise. Zapisi namenjeni samo vlasniku neće se pojaviti ni preko direktnog identifikatora događaja. Evidencija nema korisničko prepravljanje ili brisanje.

## Kada funkcija nije dostupna

Pristup zavisi od prava prijavljenog naloga, konkretne stavke, stanja procesa i uključenosti funkcije. Dugme može biti skriveno ili privremeno onemogućeno dok se učitavaju ovlašćenja ili dostupnost. Ne postoji administratorsko dugme za zaobilaženje ovih provera.

Kod neizvesnog ishoda slanja koristite ponuđenu proveru istog zahteva; kod promene podataka od druge osobe osvežite i ponovo izaberite akciju. Za stanice bez veze ili sa nepotvrđenim zaključavanjem pratite [oporavak gaming rada](EMPLOYEE.md#nedostupna-stanica-ili-neuspešna-komanda). Problemi sa instalacijom i povezivanjem računara pripadaju [tehničkom vodiču za Client](../operations/WINDOWS_CLIENT.md).

Za nedostupnu vlasničku akciju obratite se vlasniku. Za ostale česte probleme pogledajte [FAQ](FAQ.md).
