# Najčešća pitanja i problemi

[Indeks uputstava](README.md) · [Vlasnik](OWNER.md) · [Administrator](ADMIN.md) · [Zaposleni](EMPLOYEE.md) · [Kupac](CUSTOMER.md)

Odgovori opisuju trenutnu implementaciju. Ako je rezultat akcije neizvestan, prvo proverite prethodni zahtev i stanje u aplikaciji; nemojte praviti novu istu rezervaciju, narudžbinu ili sesiju u drugom prozoru.

## Zašto ne mogu da se prijavim?

Proverite email i lozinku; opcija prikaza lozinke pomaže da uočite grešku. Klijent mora prvo da aktivira nalog. Deaktiviran nalog, pogrešni podaci ili neaktiviran klijentski nalog mogu dati istu opštu poruku o neuspešnoj prijavi.

Posle previše pokušaja sistem može privremeno ograničiti nove pokušaje. Pratite prikazanu poruku, sačekajte i pokušajte ponovo. Ako aplikacija ili veza nisu dostupne, prijava takođe ne može uspeti. Za proveru naloga javite se osoblju; zaposleni se obraća administratoru ili vlasniku. [Postupak prijave](README.md#prijava-i-odjava).

## Kako se aktivira novi nalog?

Osoblje kreira klijenta i predaje jednokratni kod. Na „Prijava“ otvorite **„Aktivirajte nalog“**, unesite kod, novu lozinku i potvrdu, pa **„Aktiviraj nalog“**. Zatim se prijavite. Osoblje dobija početnu lozinku prilikom kreiranja svog naloga i ne koristi ovaj klijentski aktivacioni postupak. [Detaljni koraci](CUSTOMER.md#dobijanje-i-aktivacija-naloga).

## Aktivacioni kod nedostaje, istekao je ili je već korišćen. Šta sada?

Proverite da ste uneli ceo kod. Već iskorišćen ili istekao kod nije moguće ponovo upotrebiti. Osoblje vidi kod samo neposredno posle kreiranja naloga; posle zatvaranja prozora ne može ga ponovo prikazati. Trenutni interfejs nema akciju za ponovno izdavanje koda. Obratite se administratoru ili vlasniku radi provere i daljeg postupanja; automatski email ili „pošalji novi kod“ nisu dostupno rešenje.

## Zaboravio sam lozinku. Postoji li reset preko email-a?

Nema stranice **„Zaboravljena lozinka“** ni korisničkog postupka resetovanja preko email-a. Obratite se osoblju, odnosno administratoru ili vlasniku. Ako znate trenutnu lozinku, promenite je kroz **„Moj nalog“ → „Lični podaci“ → „Promena lozinke“**. Promena zahteva trenutnu lozinku i novu različitu lozinku od 8–100 karaktera.

## Zašto je prijava ponovo zatražena?

Prijava može isteći, biti opozvana kroz bezbednosni pregled, prestati posle promene lozinke ili deaktivacije naloga. Ponovo se prijavite odgovarajućim podacima. Ako prepoznajete neuobičajenu aktivnost, pregledajte **„Bezbednost i prijavljeni uređaji“** i promenite lozinku kada imate pristup. Ne mešajte web prijave sa preostalim gaming vremenom.

## Zašto ne mogu da rezervišem određeni termin?

Sistem proverava ceo interval, a ne samo početak. Razlog može biti:

- termin je u prošlosti ili van radnog vremena, uključujući izuzetak za taj datum;
- zaposleni nije dostupan, na odobrenom je odsustvu ili ima drugi termin;
- resurs je zauzet rezervacijom ili gaming sesijom;
- usluga, prostor ili resurs nisu aktivni ili resurs ne dozvoljava zakazivanje;
- izbor resursa nije kompatibilan sa uslugom ili nije u izabranom lokalu/zoni;
- trajanje nije dozvoljeno ili početak nije među ponuđenim terminima;
- termin je u međuvremenu zauzeo drugi korisnik;
- zaposleni koji kreira rezervaciju nema dodeljen konkretan resurs.

Pročitajte razlog u formularu, proverite prostor i trajanje, pa odaberite drugi ponuđeni interval. Osoblju mogu biti ponuđene alternative. Za običan zauzet termin može biti dostupna lista čekanja; zatvoren lokal ili stanica van upotrebe ne rešavaju se čekanjem.

## Da li „Na čekanju“ znači da je termin potvrđen?

Ne. Kreiranje rezervacije, uključujući zahtev koji unese osoblje, prvo daje status **„Na čekanju“**. Potvrda je posebna akcija osoblja kada su uslovi ispunjeni. Klijent treba da proveri „Moji termini“ i obaveštenja pre dolaska.

## Kako da rezervišem preko ponoći?

Ako usluga dozvoljava promenljivo trajanje, unesite početak, kraj i naredni **„Datum završetka“**. Kupac koristi **„Unesi tačan interval Od-Do“**, a osoblje vremenska polja u novoj rezervaciji. Interval mora stati u stvarno radno vreme koje prelazi ponoć i u dozvoljeno trajanje. Promena datuma ne omogućava rezervaciju van radnog vremena.

## Zašto određeni računar nije dostupan?

Pregled mape i spremnost za pokretanje sesije su različite provere. Računar može biti rezervisan za deo traženog intervala, imati aktivnu sesiju, biti neaktivan, bez dozvoljenog zakazivanja, u održavanju, van upotrebe, bez profila ili bez potvrđene veze/zaključavanja.

Kupac bira drugo ponuđeno mesto ili pita osoblje. Zaposleni proverava **„Radni ekran“**, „Detalji i istorija“ i „Mapa dostupnosti“. Administrator proverava i **„PC konfiguracija“** i aktivne dodele. Sam naziv „Dostupna“ nije garancija da će svako trajanje proći proveru pri pokretanju.

## Kako mogu da promenim ili otkažem rezervaciju?

**Kupac:** u „Moji termini“ otvorite rezervaciju. Ako je ponuđeno **„Otkaži“**, unesite razlog i potvrdite. Potvrđenu rezervaciju možete otkazati samo pre podešenog roka: podrazumevano više od 60 minuta pre početka, a igraonica može imati drugo podešavanje. Za izmenu vremena ili računara obratite se osoblju; kupac nema samostalnu izmenu.

**Osoblje:** u kalendaru ili listi otvorite dozvoljenu rezervaciju. Budući termin „Na čekanju“ ili „Potvrđena“ može se pomeriti kroz izmenu, uz proveru oba resursa i bez aktivne povezane gaming sesije. Usluga, klijent i trajanje ostaju isti u tom obrascu. Za otkazivanje ili odbijanje unesite razlog. Prošlu rezervaciju ne možete potvrditi, a „Završi“ se nudi tek po planiranom kraju. [Postupci](EMPLOYEE.md#potvrda-odbijanje-izmena-i-otkazivanje).

## Rezervacija nema dodeljen resurs. Ko može da ga dodeli?

Za uslugu koja zahteva fizički resurs potvrda nije dozvoljena dok on nedostaje. Vlasnik ili administrator u detaljima mogu izabrati **„Slobodan računar / resurs“ → „Dodeli resurs“**, kada sistem ponudi tu akciju. Kupac to ne radi sam; zaposleni bez ponuđene akcije treba da zatraži pomoć uprave.

## Šta se dešava kada dobijem ponudu sa liste čekanja?

Otvorite **„Moji termini“ → „Lista čekanja“**, proverite rok i kliknite **„Prihvati termin“** dok ponuda važi. Sistem tada pokušava da kreira rezervaciju; proverite otvorene detalje i njen status. Ponuda nije trajno sačuvano mesto. Ako istekne ili prihvatanje ne uspe, osvežite prikaz. Prijava može ostati na čekanju za novu ponudu.

Osoblje ne prihvata ponudu umesto klijenta. Promena sortiranja liste ne menja redosled automatskog nuđenja. Ako ste već prihvatili ponudu, odustajanje rešavate nad nastalom rezervacijom, ne samo prijavom na čekanju.

## Šta ako se gaming sesija ne pokrene?

Zaposleni proverava da li su izabrani aktivan klijent i pravi računar, da klijent ili računar već nemaju aktivnu sesiju i da je stanica dodeljena zaposlenom. Zatim proverava profil, stanje stanice, poslednju vezu, zaključavanje i dostupnost celog trajanja. Po potrebi bira drugu spremnu stanicu ili traži pomoć administratora.

Ako je ishod prethodnog starta nepoznat, koristi **„Pokušaj ponovo“** u istom prozoru; ne otvara novu sesiju za isti zahtev. Kupac ne može sam da pokrene gaming sesiju iz web naloga. [Pokretanje sesije](EMPLOYEE.md#pokretanje).

## Rezervacija je potvrđena, ali računar ne otvara igre. Zašto?

Rezervacija, aktivna gaming sesija i lokalna prijava su odvojeni koraci. Osoblje mora da pokrene sesiju za konkretnog klijenta i računar. Na Gaming Client-u prijavljuje se taj klijent svojim aktiviranim nalogom. Dozvoljene igre određuje profil stanice; njihov unos u web konfiguraciju nije instalacija igre.

Ako lokalna prijava ili pokretanje ne rade, kupac se obraća osoblju. Osoblje proverava „Radni ekran“, a administrator povezivanje i konfiguraciju klijenta.

## Šta ako računar izgubi vezu sa serverom?

U web pregledu može se pojaviti **„Bez veze“** ili upozorenje o nepotvrđenom kontaktu. Pokretanje nove sesije može biti blokirano. Već aktivan Windows Client ne dobija neograničeno vreme: po isteku dozvoljenog rada bez veze ili vremena sesije zaključava stanicu i zaustavlja korisničke aplikacije.

Kupac treba da pozove osoblje. Zaposleni proverava poslednji kontakt i istoriju, a administrator ili osoba za održavanje vraća mrežu/servis i proverava stvarno stanje. Gubitak veze ne znači automatsko produženje, povraćaj vremena ili siguran nastavak igre bez ograničenja.

## Sesija je završena, ali piše „Čeka zaključavanje“. Šta radim?

Završetak u evidenciji nije isto što i potvrda zaključavanja na računaru. Otvorite „Detalji i istorija“ i proverite poslednju komandu. Ako je ponuđeno, **„Ponovo pošalji force-lock“ → „Pošalji komandu“** traži novu komandu za zaključavanje.

**„Potvrdi fizički lock“ → „Provereno je zaključano“** koristite tek posle fizičke provere računara. Ta potvrda se beleži; ne popravlja mrežu i sama ne zaključava udaljeni Windows računar. Ako akcije nema ili problem ostane, pozovite administratora. Ne predajte stanicu novom klijentu dok spremnost nije proverena.

## Da li odjava završava gaming sesiju?

Odjava iz web aplikacije prekida web prijavu. Lokalna odjava iz Gaming Client-a zaključava računar, ali ne završava automatski serversku gaming sesiju. Ako klijent odlazi pre isteka, osoblje zasebno proverava i završava gaming sesiju. Status rezervacije takođe se proverava odvojeno.

## Zašto ne mogu da produžim sesiju?

Produžava se aktivna sesija na dozvoljenoj stanici. Sistem proverava maksimalno pojedinačno i ukupno trajanje i preklapanje sa drugim rezervacijama. Ako se sesija ili podaci u međuvremenu promene, osvežite prikaz. Ako je ishod komande nepoznat, prvo koristite **„Proveri prethodnu komandu“**. Kupac za produženje pita osoblje.

## Mogu li da promenim ili otkažem narudžbinu?

Kupac može otkazati samo svoju narudžbinu **„Primljena“**, dok je osoblje nije preuzelo. U „Moje narudžbine“ izaberite „Prikaži“, pa „Otkaži narudžbinu“ kada je dostupno i potvrdite. Poslate proizvode i količine ne možete sami menjati.

Zaposleni može otkazati nepreuzetu narudžbinu ili onu koju sam priprema. Spremnu narudžbinu mogu otkazati vlasnik ili administrator. Završena i otkazana narudžbina nemaju povratak u obradu. [Kupčev tok](CUSTOMER.md#praćenje-i-otkazivanje-narudžbine), [obrada osoblja](EMPLOYEE.md#obrada-narudžbina).

## Zašto ne mogu da nastavim obradu tuđe narudžbine?

Zaposleni koji prvi preuzme narudžbinu postaje zadužen. Samo on, administrator ili vlasnik može da je označi spremnom ili završenom. Proverite **„Moje u obradi“** i detalje. Nema dugmeta za prenos zaduženja; za nastavak tuđe obrade tražite administratora ili vlasnika.

## Slanje nije potvrđeno. Da li da ponovim klik?

Pratite poruku u otvorenom postupku. Za rezervaciju postoji „Ponovi isti zahtev“, za korpu „Proveri prethodno slanje“ pa „Ponovi isti zahtev“, a za gaming komandu „Proveri prethodnu komandu“ ili ponovni pokušaj u istom startu. Ove akcije služe proveri prethodnog slanja sa istim podacima.

Ako je potvrđeno da je podatak promenila druga osoba, osvežite podatke i ponovo izaberite dozvoljenu akciju. Kod grupnih akcija pregledajte pojedinačne neuspehe: uspešne stavke ne treba slati ponovo bez provere.

## Zašto nemam pristup određenoj stranici ili dugmetu?

Prava zavise od uloge, dozvole, sopstvenih podataka, dodeljenog resursa i trenutnog statusa. Na primer, kupac nema administrativne stranice, zaposleni nema CRM ni uređivanje cena, a administrator nema upravljanje vlasničkim nalogom ili evidenciju namenjenu samo vlasniku.

„Sve stanice“ zaposlenom daje širi pregled rezervacija, bez upravljanja nedodeljenim stanicama. Za PC operativu administrator proverava pojedinačnu aktivnu dodelu resursa; stara dodela lokacije ne obuhvata automatski nove računare. Funkcija može biti i isključena, kao „Izveštaji“. Nema korisničkog uređivača za proizvoljno dodavanje privilegija. [Pregled pristupa](README.md#snalaženje-u-aplikaciji).

## Zašto ne vidim početak smene ili zahtev za sopstveno odsustvo?

Takav korisnički tok nije implementiran. „Aktivan nalog“ označava pristup aplikaciji, a dodela stanice pravo upravljanja. Vlasnik i administrator vode radno vreme igraonice i zahtev/odluku o odsustvu zaposlenog. Dnevni raspored rezervacija nije evidencija prisustva ili plan smena.

## Obrisani nalog je vraćen, ali osoba i dalje ne može da se prijavi. Zašto?

Vraćanje obrisanog naloga uklanja oznaku brisanja, ali ga ne aktivira automatski. Proverite status. Ne postoji opšta korisnička akcija za ponovno aktiviranje neaktivnog naloga. Vraćanje takođe ne izdaje novi klijentski aktivacioni kod. Obratite se vlasniku ili osobi koja održava sistem; ponovnim brisanjem i vraćanjem ne rešavate prijavu.

## Zašto se razlikuju brojevi na dashboardu, listama i izveštajima?

Pregledi nemaju uvek isti obuhvat: današnji termini, izabrani period, aktivne narudžbine ili dodeljene stanice. Na listama mogu ostati filteri, a deo statistike namerno je nezavisan od pretrage ili statusa. Proverite opis uz pokazatelj i vreme poslednjeg osvežavanja.

„Realizovani prihod“ koristi završene narudžbine. „Iznosi po statusu narudžbina“ prikazuju iznose i nezavršenih narudžbina po statusu. Nije implementiran obračun naplate gaming minuta ili dokaz plaćanja na osnovu tih iznosa.

## Zašto nema izveštaja ili ne mogu da ga preuzmem?

„Izveštaji“ moraju biti uključeni i nalog mora imati pravo pristupa. Generisanje traje: sačekajte „Spreman“ u istoriji. Fajl može biti neuspešno generisan ili istekao; tada proverite poruku i po potrebi generišite novi izveštaj. Vidite svoje generisane fajlove, ne sve fajlove drugih naloga.

Završni datum nije uključen u period. Rasporedi i šabloni pamte fiksne datume, pa svakodnevno zakazan izveštaj ne prelazi automatski na novi dan. Zaposleni može da generiše i preuzme izveštaj, ali ne da napravi automatski raspored. [Detalji](OWNER.md#izveštaji-i-automatsko-generisanje).

## Uključio sam email obaveštenja, ali poruka nije stigla. Šta proveravam?

U ovoj implementaciji email isporuka je probna; uključen kanal ne garantuje stvarnu isporuku. Proverite zvonce, „Moji termini“, listu čekanja ili narudžbine direktno u aplikaciji. Izmene kanala sačuvajte kroz „Sačuvaj promene“. Obavezna bezbednosna obaveštenja ne možete isključiti. Nema korisničkog dugmeta za ponovno slanje svih poruka.

## Šta mogu kada web aplikacija nema vezu?

Ograničeni offline pregled, ako je uključen i ima prethodno sačuvane podatke, služi čitanju. Prikaz može biti zastareo. Slanje izmena i operativnih komandi zahteva vezu; nemojte računati da će se svi klikovi automatski poslati kasnije. Vratite vezu, proverite prethodne zahteve i osvežite stanje pre nastavka.

## Kako mogu da kontaktiram osoblje kada nešto ne radi?

Kupac se obraća osoblju na šalteru ili koristi kontakt koji je igraonica zasebno dala. Zaposleni zove administratora ili vlasnika. U web aplikaciji nema ugrađenog četa, obrasca za podršku ili imenika sa kontaktom podrške; zvonce nije kanal za slanje poruke osoblju.

Pripremite oznaku računara ili narudžbine/rezervacije ako je prikazana, datum i vreme, opis poslednje akcije i tačan tekst greške. Kod problema stanice prosledite i **„Support ID“** iz istorije ako postoji; kod evidencije promena dostupan je **„Kopiraj ID događaja“**. Ne šaljite svoju lozinku ili aktivacione/upisne kodove kao opis greške.
