# Uputstvo za vlasnika - OWNER

[Indeks uputstava](README.md) · [Administrator](ADMIN.md) · [Zaposleni](EMPLOYEE.md) · [Kupac](CUSTOMER.md) · [FAQ](FAQ.md)

Vlasnik ima pristup poslovnom pregledu, upravljanju osobljem i klijentima, ponudi, prostoru, radnom vremenu i gaming operativi. Sistem i dalje proverava stanje konkretne stavke: vlasnička uloga ne omogućava zauzimanje već zauzetog termina, ponovno otvaranje završene narudžbine ili zaobilaženje nespremne stanice.

Za prijavu, profil, lozinku, prijavljene uređaje i obaveštenja koristite [zajedničke postupke](README.md#prijava-i-odjava). Vlasnički nalog dobijate od osobe koja je postavila sistem; ne kreira se kroz „Novi korisnik“.

## Navigacija vlasnika

Bočni meni sadrži **„Pregled“**, **„Radni ekran“**, **„Rezervacije“**, **„Narudžbine“**, **„Klijenti“**, **„Oprema“** i **„Upravljanje“**.

- **„Oprema“** otvara **„Prostor i resursi“** i **„PC konfiguracija“**.
- **„Upravljanje“** otvara **„Tim i pristup“**, **„Ponuda i cene“**, **„Rad igraonice“**, **„Izveštaji“** kada su uključeni i **„Evidencija promena“**.
- **„Rezervacije“** otvara kalendar. Koristite **„Raspored“**, **„Lista“** i **„Čekanje“** za odgovarajuće prikaze.

## Poslovni pregled i analitika

Stranica **„Pregled“** služi praćenju tekućeg rada i poslovnih rezultata. Ima prikaze **„Operativni pregled“** i **„Analitika“**.

1. U „Operativni pregled“ proverite današnje rezervacije, nepreuzete narudžbine, gaming stanje i deo **„Zahteva pažnju“**.
2. Izaberite **„Otvori pregled“** uz upozorenje da pređete na odgovarajuću listu i rešite stavku.
3. Otvorite „Analitika“, unesite **„Od“** i **„Do“**, po potrebi izaberite **„Zaposleni“**, pa kliknite **„Primeni“**.
4. Pregledajte rezultate, poređenje sa prethodnim periodom i grafikone. Filter zaposlenog koristi se za opterećenje; ukupan promet ne postaje promet samo tog zaposlenog.
5. Za CSV koristite **„Izvezi prikaz“** ili **„Izvezi izvorne podatke“**.
6. U **„Prilagodi dashboard“** uključite željene grafikone, promenite redosled dugmadima **„Gore“** i **„Dole“**, podesite **„Prag %“** za opterećenje i izaberite **„Sačuvaj raspored“**.

**Rezultat:** pregled za izabrani period i sačuvan lični raspored grafikona. „Sačuvaj raspored“ ovde uređuje dashboard, a ne smene zaposlenih.

**Ograničenja:** „Realizovani prihod“ predstavlja prihod od završenih narudžbina. Nije obračun naplaćenih gaming minuta niti potvrda plaćanja. Pokazatelji mogu imati različit obuhvat: današnji termini, sve aktivne narudžbine ili izabrani poslovni period. Pročitajte opis uz broj. Ako neki deo nije učitan, osvežite ga pre odlučivanja.

## Zaposleni, administratori i korisnički nalozi

### Kreiranje zaposlenog

Otvorite **„Upravljanje“ → „Tim i pristup“**. Stranica **„Zaposleni“** objedinjuje naloge zaposlenih i njihove dodele.

1. Izaberite **„Novi zaposleni“**.
2. Unesite **„Ime i prezime“**, **„Email adresa“** i **„Početna lozinka“** od 8–100 karaktera.
3. Kliknite **„Dodaj zaposlenog“** i predajte podatke za prijavu zaposlenom.
4. U prikazanoj potvrdi ili profilu zaposlenog izaberite **„Dodeli pristup resursima“** odnosno **„Dodeli lokaciju“** ako želite da dodelite postojeće resurse lokacije.
5. Izaberite **„Lokacija“** i **„Potvrdi dodelu“**, pa proverite pojedinačne dodele resursa.

**Rezultat:** zaposlenom je kreiran nalog; dodela resursa je poseban korak. Već korišćena email adresa sprečava kreiranje.

**Važno:** dodela lokacije dodeljuje njene tada postojeće resurse. Novi računar dodat kasnije ne nasleđuje automatski tu dodelu. Status „Aktivan nalog“ i dodela resursa nisu evidencija prisustva ili početka smene.

### Pregled, deaktiviranje i brisanje

1. Na „Zaposleni“ pretražite ime ili email; po potrebi promenite **„Status naloga“** i **„Sortiranje“**.
2. Otvorite profil zaposlenog. Proverite osnovne podatke, dodeljene lokacije i resurse i odobrena odsustva.
3. Za prekid pristupa koristite **„Deaktiviraj nalog“** i potvrdite. Nalog i istorija ostaju sačuvani.
4. Za uklanjanje iz aktivnog pregleda koristite **„Obriši nalog“**, unesite **„Razlog brisanja“** i potvrdite.
5. Za više aktivnih zaposlenih označite redove i izaberite **„Deaktiviraj izabrane“**. Proverite zbir i eventualne neuspešne stavke.

Deaktiviran ili obrisan korisnik gubi pristup. Ne možete deaktivirati ili obrisati svoj nalog ni drugi vlasnički nalog.

### Administrator i obrisani nalozi

U okviru „Tim i pristup“ otvorite **„Nalozi i obrisani“**; naslov stranice je **„Korisnici i uloge“**.

1. Za novi administratorski nalog kliknite **„+ Novi korisnik“**.
2. Unesite ime, email i početnu lozinku, odaberite **„Administrator“** i kliknite **„Kreiraj korisnika“**. Na istom mestu možete izabrati i „Zaposleni“.
3. Za pregled postojećih naloga koristite filtere uloge i statusa, pretragu i detalje izabranog naloga.
4. Za vraćanje prethodno obrisanog naloga otvorite **„Obrisani korisnici“**, pronađite ga, izaberite **„Vrati nalog“** i potvrdite.

Vlasnik može upravljati administratorskim, zaposlenim i klijentskim nalozima, uz zaštitu vlasničkih naloga. Vraćanje može biti odbijeno ako email već koristi drugi neobrisani nalog. Vraćanje uklanja oznaku brisanja, ali ne aktivira nalog; ne postoji opšta korisnička akcija za ponovno aktiviranje neaktivnog naloga. Vraćanje takođe nije zamena za aktivacioni kod klijenta. Klijente kreirajte kroz **„Klijenti“**, ne kroz „Novi korisnik“.

Stranica prikazuje uloge, ali nema uređivač za promenu uloge postojećeg naloga, proizvoljno dodeljivanje pojedinačnih privilegija ili postavljanje nove lozinke drugoj osobi.

## Klijenti i interne beleške

Za kreiranje, predaju aktivacionog koda, izmenu imena/email-a i deaktiviranje koristite postupak [rad sa klijentima](EMPLOYEE.md#rad-sa-klijentima). Dostupni su profil klijenta i istorija rezervacija, narudžbina i gaming sesija.

Vlasnik dodatno ima **„CRM“** u profilu klijenta:

1. Otvorite **„Klijenti“**, pronađite osobu i otvorite **„Prikaži profil“**.
2. Izaberite karticu „CRM“.
3. Za oznaku unesite **„Novi tag“** i kliknite **„Dodaj tag“**. Klik na postojeći tag omogućava uklanjanje.
4. U **„Nova beleška“** unesite tekst i izaberite **„Sačuvaj belešku“**.
5. Za postojeću belešku koristite **„Izmeni“** ili **„Obriši“** i završite ponuđeni postupak. Pretraga **„Pretraži beleške i tagove“** sužava prikaz.

**Rezultat:** interne beleške i tagovi vezani su za tog klijenta. Njih vide vlasnik i administrator sa odgovarajućim pravom; zaposleni i kupac nemaju ovu oblast. Ne postoji ponovno prikazivanje već zatvorenog aktivacionog koda niti korisnička akcija za njegovo ponovno izdavanje.

## Ponuda, usluge i cene

Otvorite **„Upravljanje“ → „Ponuda i cene“**. Kartice **„Usluge“** i **„Proizvodi“** razdvajaju rezervisanje vremena od naručivanja robe.

### Dodavanje i izmena stavke

1. Kliknite **„Nova stavka“** i odaberite **„Usluga“** ili **„Proizvod“**.
2. Unesite **„Naziv“**, **„Cena (RSD)“** i, po želji, „Opis“.
3. Za uslugu unesite **„Trajanje usluge (min)“**. Uključite **„Usluga zahteva fizički resurs“** ako je za termin potrebno konkretno mesto ili oprema.
4. Po želji izaberite sliku u delu „Slika stavke“, pa kliknite **„Kreiraj stavku“**.
5. Za postojeću stavku otvorite meni akcija → **„Izmeni“**, promenite podatke i izaberite **„Sačuvaj izmene“**. Za sliku koristite **„Promeni sliku“ → „Sačuvaj sliku“**.

**Rezultat:** stavka je sačuvana u ponudi. Cena mora biti veća od nule, sa najviše dve decimale. Usluga ima pozitivno trajanje; proizvod nema trajanje. Slika mora proći proveru formata i veličine. Ako se podaci sačuvaju, a slika ne uspe, ponovite samo slanje slike ponuđenom akcijom.

Usluga povezana sa fizičkim resursom mora ostati usluga koja zahteva resurs. Standardno trajanje usluge nije isto što i produžavanje već aktivne gaming sesije.

### Dostupnost, brisanje i vraćanje

1. Pronađite stavku pomoću pretrage, statusa, raspona cena ili sortiranja.
2. U meniju akcija izaberite **„Deaktiviraj“** ili **„Aktiviraj“** za promenu ponude novim korisničkim akcijama.
3. Za više stavki označite kartice i koristite **„Aktiviraj izabrane“** ili **„Deaktiviraj izabrane“**.
4. **„Obriši“** zahteva razlog i uklanja stavku iz redovne ponude.
5. Za vraćanje otvorite **„Obrisane stavke“**, izaberite **„Vrati stavku“** i proverite njen status.

Kupci i zaposleni vide aktivnu ponudu; nemaju ove upravljačke akcije. Promena cene proizvoda ne menja iznose već kreiranih narudžbina. Posle grupne akcije proverite i neuspešne stavke.

## Lokacije, zone, resursi i mapa

Otvorite **„Oprema“ → „Prostor i resursi“**. Lokacija predstavlja lokal, zona deo prostora, a resurs konkretan računar, PlayStation, simulator, VIP sobu ili drugi resurs.

### Priprema prostora

1. U **„Upravljaj prostorom“** izaberite **„Nova lokacija“**; ako nema lokacija, koristite **„Dodaj prvu lokaciju“**.
2. Unesite naziv, šifru, adresu i vremensku zonu, proverite „Aktivan“ i kliknite **„Sačuvaj“**.
3. Izaberite lokal, pa **„Nova zona“**. Unesite naziv, šifru i ostala potrebna polja, pa sačuvajte.
4. Izaberite konkretnu zonu, pa **„Novi resurs“**.
5. Unesite naziv, šifru, uslugu, tip i kapacitet. Proverite **„Dozvoljeno zakazivanje“** i **„Aktivan“**, pa sačuvajte.

**Rezultat:** resurs je vezan za zonu i uslugu. Za izmenu koristite **„Uredi lokaciju“**, **„Uredi zonu“** ili akciju resursa **„Podesi resurs“**. Novi resurs zahteva postojeću uslugu. Neaktivan prostor ili resurs, zabrana zakazivanja i stanje stanice mogu sprečiti rezervisanje. Kapacitet nije obećanje da sistem dozvoljava preklapanje rezervacija na istom resursu.

### Provera dostupnosti i pristup zaposlenih

1. Izaberite **„Lokal“**, **„Zona“** i **„Početak intervala“**.
2. Prebacite **„Mapa“ / „Lista“** i otvorite **„Detalji“** resursa. Pregled proverava jedan sat od izabranog početka; rezervacija dodatno proverava celo traženo trajanje.
3. Za PC izaberite **„Otvori operativu“**; za ostale resurse koristite **„Otvori kalendar“**.
4. Za ovlašćenja izaberite **„Zaposleni na resursu“**, pa **„Dodeli stanicu“** ili **„Ukloni pristup“** uz zaposlenog.
5. **„Zaposleni na lokaciji“ → „Dodeli lokaciju“ / „Ukloni pristup“** služi grupnoj dodeli ili uklanjanju postojećih resursa lokacije. Posle toga proverite pojedinačne dodele.

**Ograničenja:** pristup stanici određuju pojedinačne dodele. Zaposleni ne dobija pravo nad novim resursom samo zato što je ranije imao dodeljenu lokaciju. Pregled mape nije potvrda spremnosti Gaming Client-a niti rezervacija mesta.

### Uređivanje mape

1. Kada su mapa i podešavanja učitani, u „Upravljaj prostorom“ izaberite **„Uredi mapu“**.
2. Koristite **„Prostorija“**, **„Zid“** i **„Vrata / prolaz“**; element možete dodati i kroz **„Dodaj u centar“**.
3. Alatom **„Izaberi“** odaberite element i podesite njegove podatke i geometriju u bočnom delu.
4. Za opremu koristite **„Postavi resurs“**, odaberite **„Postojeći resurs“** i postavite ga na mapu. Ovo ne kreira novi poslovni resurs.
5. Kliknite **„Sačuvaj“**, ili **„Otkaži“** da odustanete od izmena.

**Rezultat:** sačuvan raspored prostora na mapi. Nedostupni podaci ili promena mape od strane druge osobe mogu sprečiti čuvanje; ponovo učitajte aktuelno stanje pre izmene.

## Radno vreme, izuzeci i odsustva

Otvorite **„Upravljanje“ → „Rad igraonice“**. Prikazane radne sate i termine tumačite u poslovnoj zoni **Europe/Belgrade**.

### Nedeljno radno vreme

1. Otvorite karticu **„Rad igraonice“**.
2. Za svaki dan podesite **„Radi“ / „Ne radi“**, **„Vreme otvaranja“** i **„Vreme zatvaranja“**.
3. Sačuvajte pojedinačni dan dugmetom **„Sačuvaj“**, ili sve izmenjene dane kroz **„Sačuvaj izmenjene dane (…)“**.
4. Ako ne želite promenu, izaberite **„Poništi“**. Posle sukoba sa tuđom izmenom koristite **„Učitaj aktuelne“** i proverite vrednosti.

**Rezultat:** novi raspored koristi se za proveru dostupnosti termina. Kasnije vreme otvaranja od zatvaranja označava rad preko ponoći; ista vremena nisu celodnevno radno vreme. Proverite poruku za neispravan unos. Grupno čuvanje može uspeti samo za neke dane.

### Posebni datumi

1. Na kartici **„Izuzeci“** kliknite **„Novi izuzetak“**.
2. Unesite **„Datum“** i „Opis“.
3. Uključite **„Ceo dan zatvoreno“**, ili unesite posebno vreme otvaranja i zatvaranja.
4. Kliknite **„Sačuvaj izuzetak“**. Postojeći izuzetak otvorite za izmenu ili brisanje ponuđenom akcijom.

**Rezultat:** izuzetak menja rad za taj datum. Datum mora biti budući; za isti datum ne mogu postojati dva izuzetka. Ovaj obrazac ne bira posebnu lokaciju: ne pretpostavljajte da ste njime promenili samo jedan lokal. Promena dostupnosti nije automatsko otkazivanje već postojećih rezervacija; proverite ih u kalendaru.

### Odsustva zaposlenih

1. Otvorite **„Odsustva zaposlenih“ → „Novo odsustvo“**.
2. Izaberite aktivnog zaposlenog, unesite **„Početak“**, **„Kraj“** i **„Razlog“**, pa kliknite **„Sačuvaj zahtev“**.
3. Zahtev se prvo pojavljuje na čekanju. Otvorite „Detalji“ ili meni akcija i izaberite **„Odobri“**, **„Odbij“** ili **„Otkaži“**.
4. Već odobreno odsustvo možete ukloniti iz dostupnosti akcijom **„Otkaži odsustvo“** i potvrdom.

**Rezultat:** samo odobreno odsustvo blokira zaposlenog za rezervacije u tom periodu. Preklapanje sa drugim zahtevom na čekanju ili odobrenim odsustvom može biti odbijeno; završeno odsustvo ne može se naknadno odobriti. Ovo nije planiranje smena ni evidencija dolaska na posao. Zaposleni nema sopstveni obrazac za zahtev za odsustvo.

## Rezervacije, kalendar, lista čekanja i narudžbine

Vlasnik može izvršavati operativne postupke iz [uputstva za zaposlenog](EMPLOYEE.md), sa sledećim razlikama:

| Oblast | Pristup vlasnika i važna razlika |
| --- | --- |
| [Kalendar i rezervacije](EMPLOYEE.md#kalendar-i-rezervacije) | Upravljanje svim resursima. Za premeštanje ne treba posebna dodela stanice. |
| Rezervacija bez obaveznog resursa | U detaljima izaberite „Slobodan računar / resurs“, pa „Dodeli resurs“. Bez njega se takva rezervacija ne može potvrditi. |
| [Lista čekanja](EMPLOYEE.md#lista-čekanja) | Pregled i upravljanje svim prijavama; ponude šalje sistem, a prihvata klijent. |
| [Gaming sesije](EMPLOYEE.md#gaming-sesije) | Start, produženje, završetak i ponuđene akcije oporavka na svim dozvoljenim PC stanicama. |
| [Narudžbine](EMPLOYEE.md#obrada-narudžbina) | Možete nastaviti obradu i kada je narudžbinu preuzela druga osoba. Možete otkazati i spremnu narudžbinu; završena se ne menja. |

Kreiranje rezervacije i dalje proizvodi status **„Na čekanju“**; potvrda je zasebna akcija. Otvaranje gaming sesije nije isto što i potvrđivanje ili završavanje rezervacije. Vlasnik ne pravi narudžbine za preuzimanje kroz korisničku korpu: taj tok je dostupan kupcu.

## PC konfiguracija i povezivanje Gaming Client-a

Otvorite **„Oprema“ → „PC konfiguracija“**. Kartice su **„Stanice“**, **„Aplikacije“**, **„Profili“** i **„Client paket“**. Ovo je priprema računara; dnevni start i kraj sesije rade se na „Radni ekran“.

### Priprema nove stanice

1. **„+ Nova stanica“** otvara dodavanje fizičkog resursa. Kreirajte tip **„Gaming računar“** u odgovarajućoj zoni i povežite uslugu.
2. Na kartici **„Aplikacije“** dodajte **„Nova aplikacija“**. Unesite kod, naziv, tip i **„Putanja izvršne datoteke“**. Potreban je i podatak za proveru identiteta aplikacije: izdavač, otisak sertifikata ili SHA-256. Za ove podatke koristite pomoć osobe koja održava računare.
3. Na kartici **„Profili“** izaberite **„Novi profil“**, unesite kod i naziv, odaberite dozvoljene aplikacije i kliknite **„Sačuvaj profil“**. Profil mora sadržati najmanje jednu aktivnu igru. Za pokretač i igru podesite istu grupu zavisnosti; proverite ponuđena pravila pokretanja.
4. Otvorite stanicu i **„Podesi profil i Client“** odnosno **„Podesi stanicu“**. Izaberite aktivan „Profil aplikacija“ i „Operativno stanje“.
5. Ako je Windows Client postavljen na računaru, uključite **„Gaming Client integracija uključena“**, proverite interval javljanja i toleranciju prekida veze, pa kliknite **„Sačuvaj“**. Tolerancija mora biti najmanje jednaka intervalu javljanja.
6. Proverite dodele zaposlenih za novi resurs i spremnost na „Radni ekran“.

**Rezultat:** sačuvana konfiguracija stanice i dozvoljenih aplikacija. Sam unos Windows putanje ne instalira igru, a čuvanje profila ne potvrđuje da je politika već primenjena na računaru. Aplikacije u profilu i profili dodeljeni stanicama ne mogu se slobodno brisati dok su u upotrebi.

Stanje **„Održavanje“** sprečava redovan početak sesije. **„Van upotrebe“** je trajno povlačenje kroz ovaj interfejs: tako povučena stanica ne može se ponovo aktivirati. Ne birajte ga za privremeni kvar. Ručni režim bez uključene integracije ne potvrđuje automatsku kontrolu Windows računara.

### Upis i identitet klijenta

1. Otvorite **„Upis i identitet klijenta“** za konkretnu stanicu.
2. Za prvo povezivanje izaberite **„Novi kod za upis“**. Ako integracija nije uključena, prvo je uključite u podešavanju stanice.
3. Kliknite **„Kopiraj kod“** i predajte ga osobi koja povezuje Windows Client. Kod ima prikazan rok i vidi se samo u otvorenom prozoru.
4. Kod već upisanog klijenta **„Rotiraj ključ“** izdaje kod za zamenu identiteta.
5. **„Opozovi identitete“** prekida važenje aktivnih identiteta i neiskorišćenih kodova. Za novi pristup potreban je ponovni upis.

**Ograničenja:** izdavanje koda ne obavlja instalaciju ili upis samo po sebi. Za Windows postupak koristite [tehnički vodič za Client](../operations/WINDOWS_CLIENT.md). Pre zatvaranja preuzmite jednokratni kod; nemojte ga deliti sa kupcima.

Na kartici **„Client paket“** proverite objavljenu verziju i stanje. **„Preuzmi Client“** pojavljuje se kada je paket zaista dostupan i proverljiv. Ako je paket neobjavljen, razvojni ili nedostupan, pročitajte poruku i po potrebi kliknite **„Ponovi proveru“**. Postojanje ove kartice ne znači da je produkcioni paket objavljen.

## Izveštaji i automatsko generisanje

Otvorite **„Upravljanje“ → „Izveštaji“**, ako je funkcija uključena.

1. Odaberite **„Definicija“**: „Narudžbine“, „Rezervacije“, „Iznosi po statusu narudžbina“ ili „Opterećenje zaposlenih“.
2. Odaberite „Format“ - CSV, XLSX ili PDF - i datume „Od“ i **„Do (datum nije uključen)“**. Dostupne su i prečice za period.
3. Kliknite **„Generiši“**. U „Istorija“ pratite „Na čekanju“, „U obradi“, pa „Spreman“ ili poruku neuspeha.
4. Kada je spreman, izaberite **„Preuzmi“**. Obradu na čekanju ili u toku možete otkazati dugmetom **„Otkaži“** i potvrdom.
5. Za ponovnu upotrebu izbora kliknite **„Sačuvaj šablon“**, unesite naziv i sačuvajte. Kasnije ga birate kroz „Sačuvani šabloni“ i proveravate datume.
6. Za automatizaciju kliknite **„Zakaži izveštaj“**, odaberite učestalost, „Lokalno vreme“ i „Vremenska zona“, pa **„Sačuvaj raspored“**. U delu „Rasporedi“ proverite sledeće pokretanje; „Obriši“ uklanja raspored.

**Rezultat:** izveštaj koji možete preuzeti i, po izboru, lični šablon ili raspored. Period mora biti pozitivan i najviše 366 dana. Za ceo 1. novembar unesite „Od“ 1. novembar i „Do“ 2. novembar. Gotovi fajlovi imaju ograničen rok dostupnosti; ako je izveštaj istekao, generišite ga ponovo.

Istorija, šabloni i rasporedi pripadaju nalogu koji ih je napravio. Raspored i šablon pamte **fiksni period**, ne pomeraju ga automatski na „jučerašnji dan“. „Iznosi po statusu narudžbina“ uključuju i nezavršene narudžbine razdvojene po statusima; ne tumačite ceo iznos kao realizovani prihod ili naplatu gaming vremena.

Ako je posebno uključen **„AI sažetak“**, možete ga zatražiti samo za svoj gotov izveštaj, uz prikazanu saglasnost. Šalju se definicija, broj redova i vreme preseka, pa sažetak nije analiza svih stavki poslovanja. Proverite izvore i ograničenja; ponuđene ocene su „Prihvati“, „Ispravljeno“ i „Odbaci“. Funkcija je podrazumevano isključena i može vratiti samo osnovni sažetak kada AI usluga nije dostupna.

## Evidencija promena i granice podešavanja

U **„Upravljanje“ → „Evidencija promena“** možete proveriti ko je menjao podatke.

1. Pretražite događaje ili otvorite **„Filteri“**.
2. Podesite period i ponuđene kriterijume, pa kliknite **„Primeni filtere“**. Napredna polja za akciju i tip resursa traže tačnu vrednost iz događaja.
3. Otvorite događaj i pregledajte izvršioca, vreme, resurs, razlog i zabeležene promene pre/posle.
4. Ako prijavljujete problem, kroz **„Kopiraj ID događaja“** preuzmite oznaku događaja.

**Rezultat:** pregled sačuvane evidencije. Nisu svi događaji promena poslovnog podatka niti svaki ima oba stanja. Vlasnik vidi i zapise namenjene samo vlasniku; administrator vidi upravljačke zapise. Evidencija je za pregled, nema korisničku akciju za njeno prepravljanje.

U ovoj verziji nema stranice „Dokumenti“, uređivača proizvoljnih dozvola, web kontrole svih sistemskih podešavanja, obračuna smena ili ugrađenog korisničkog četa. Za svakodnevne greške i način obraćanja osoblju pogledajte [FAQ](FAQ.md).
