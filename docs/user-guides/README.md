# G-Manager - korisnička uputstva

Ova uputstva opisuju trenutno implementiranu aplikaciju, prema statičkom pregledu koda od **1. novembra 2026.** Namenjena su svakodnevnom radu u igraonici. Nazivi pod navodnicima odgovaraju interfejsu. Kupac je u aplikaciji označen kao **„Klijent“**; u ovim uputstvima oba naziva označavaju ulogu CUSTOMER.

## Izaberite svoje uputstvo

| Uloga | Uputstvo | Najvažnije oblasti |
| --- | --- | --- |
| Vlasnik - OWNER | [Uputstvo za vlasnika](OWNER.md) | Poslovni pregled, tim, ponuda, prostor, podešavanja i bezbednost |
| Administrator - ADMIN | [Uputstvo za administratora](ADMIN.md) | Administracija i operativa, uz ograničenja prema vlasniku |
| Zaposleni - EMPLOYEE | [Uputstvo za zaposlenog](EMPLOYEE.md) | Klijenti, rezervacije, gaming sesije i obrada narudžbina |
| Kupac / klijent - CUSTOMER | [Uputstvo za kupca](CUSTOMER.md) | Aktivacija, rezervisanje, korpa i sopstvene aktivnosti |
| Sve uloge | [Najčešća pitanja i problemi](FAQ.md) | Prijava, nedostupan termin ili računar, dozvole i pomoć |

Postupci zajednički svim ulogama nalaze se ispod. Za tehničko održavanje koristite [glavni indeks dokumentacije](../README.md).

## Prijava i odjava

Otvorite adresu G-Manager-a koju ste dobili od igraonice. Na stranici **„Prijava“** unesite **„Email adresa“** i **„Lozinka“**, pa izaberite **„Prijavi se“**. Ikonica za prikaz lozinke omogućava proveru unosa. Uspešna prijava otvara početni ekran vaše uloge ili prethodno traženu dozvoljenu stranicu.

- Vlasnik i administrator obično otvaraju **„Pregled“**.
- Zaposleni obično otvara **„Radni ekran“**.
- Kupac otvara **„Početna“**. Pre prve prijave mora aktivirati nalog: [aktivacija kupca](CUSTOMER.md#dobijanje-i-aktivacija-naloga).

Nalog zaposlenog ili administratora kreira ovlašćeno osoblje sa početnom lozinkom. Nema javne registracije, dugmeta za samostalno vraćanje zaboravljene lozinke niti kreiranja vlasnika kroz korisnički interfejs.

Za odjavu otvorite **„Moj nalog“** u gornjem desnom uglu i izaberite **„Odjavi se“**. Ako imate nesačuvane unose, aplikacija traži potvrdu njihovog odbacivanja. Ako zahtev još čeka ishod ili je otvoren jednokratni kod, prvo rešite taj postupak. Odjava iz web aplikacije nije završavanje gaming sesije.

Ako prijava ne uspe, pogledajte [FAQ](FAQ.md#zašto-ne-mogu-da-se-prijavim).

## Snalaženje u aplikaciji

Na računaru se koristi bočna navigacija; možete je skupiti dugmetom **„Sažmi navigaciju“** i proširiti odgovarajućom ikonicom. Na manjem ekranu otvorite **„Meni“**. Kupac ima i donju brzu navigaciju. Logo G-Manager vraća na početni ekran.

Povezani prikazi imaju dodatnu navigaciju iznad sadržaja. Na primer, **„Rezervacije“** otvaraju raspored, dok **„Raspored“**, **„Lista“** i **„Čekanje“** prebacuju između kalendara, liste rezervacija i liste čekanja. **„Tim i pristup“** vodi na zaposlene; **„Nalozi i obrisani“** otvara ostale korisničke naloge.

Sledeća tabela prikazuje stranice i uobičajeni pristup. Putanja je deo adrese posle adrese aplikacije, a ne link do dokumenta.

| Stranica ili ulaz u navigaciji | Putanja | Vlasnik | Administrator | Zaposleni | Kupac |
| --- | --- | --- | --- | --- | --- |
| Prijava / Aktivacija naloga | `/login`, `/activate` | Prijava | Prijava | Prijava | Prijava i aktivacija |
| Pregled / Radni ekran | `/dashboard` | Poslovni pregled | Pregled sa naglaskom na operativu | Dodeljeni PC računari i dnevni zadaci | - |
| Radni ekran / Stanje računara sada | `/gaming-sessions` | Da | Da | Dodeljene stanice | - |
| Rezervacije → Raspored; naslov „Kalendar“ | `/calendar` | Da | Da | Upravljanje u svom opsegu; širi pregled | - |
| Rezervacije → Lista | `/reservations` | Da | Da | Upravljanje u svom opsegu; širi pregled | - |
| Rezervacije → Čekanje | `/waitlist` | Da | Da | U dozvoljenom opsegu | - |
| Narudžbine | `/orders` | Obrada | Obrada | Obrada prema zaduženju | - |
| Klijenti | `/customers` | Da, uključujući CRM | Da, uključujući CRM | Da, bez CRM beleški i tagova | - |
| Oprema | `/equipment` | Izbor oblasti | Izbor oblasti | - | - |
| Upravljanje | `/management` | Izbor oblasti | Izbor oblasti | - | - |
| Alati | `/tools` | Dostupno i direktnom adresom | Dostupno i direktnom adresom | Izbor oblasti | - |
| Tim i pristup → Zaposleni | `/employees` | Da | Da | - | - |
| Nalozi i obrisani; naslov „Korisnici i uloge“ | `/users` | Uz zaštitu vlasnika | Upravljanje samo zaposlenima | - | - |
| Ponuda i cene / Ponuda | `/catalog` | Uređivanje | Uređivanje | Pregled aktivne ponude | Pregled, rezervisanje i korpa |
| Rad igraonice | `/settings` | Da | Da | - | - |
| Prostor i resursi / Mapa dostupnosti / Izaberi mesto | `/resources` | Uređivanje i pregled | Uređivanje i pregled | Pregled | Pregled i prelazak na rezervaciju |
| PC konfiguracija / Informacije o stanicama | `/stations` | Uređivanje | Uređivanje | Pregled | - |
| Izveštaji | `/reports` | Generisanje i rasporedi | Generisanje i rasporedi | Generisanje | - |
| Evidencija promena | `/audit` | Svi dozvoljeni zapisi, uključujući zapise samo za vlasnika | Upravljački zapisi | - | - |
| Početna | `/home` | - | - | - | Sopstvene aktivnosti |
| Rezerviši / Moji termini | `/my-reservations` | - | - | - | Sopstveni termini i lista čekanja |
| Moje narudžbine | `/my-orders` | - | - | - | Proizvodi, korpa i sopstvena istorija |
| Moj profil / Bezbednost i uređaji / Podešavanja obaveštenja | `/profile`, `/sessions`, `/notification-preferences` | Svoj nalog | Svoj nalog | Svoj nalog | Svoj nalog |

Adresa `/` preusmerava na dozvoljenu početnu stranicu. `/unauthorized` prikazuje **„Pristup nije dozvoljen“**; nepostojeća adresa prikazuje **„Stranica nije pronađena“**. Odatle koristite **„Nazad“** ili **„Početna stranica“**.

**Vidljiva stranica ne znači pravo na svaku akciju.** Sistem proverava ulogu, dozvolu, vlasništvo nad podacima, dodelu resursa i trenutno stanje. Uputstva opisuju podrazumevane uloge; ponuđena dugmad i konačna provera sistema određuju šta možete izvršiti. Prikaz svih stanica zaposlenom ne daje pravo da njima upravlja.

„Izveštaji“ mogu biti isključeni u konkretnom okruženju. Opcioni **„AI sažetak“** podrazumevano je isključen. Ne postoji korisnička stranica za pojedinačno dodeljivanje privilegija ili uključivanje ovih funkcija.

## Lični podaci i avatar

Otvorite **„Moj nalog“ → „Lični podaci“**. Stranica **„Moj profil“** prikazuje podatke, ulogu i status vašeg naloga.

1. Izmenite **„Ime i prezime“** i izaberite **„Sačuvaj izmene“**.
2. Za fotografiju izaberite **„Promeni avatar“**, odaberite PNG ili JPEG i proverite pregled.
3. Potvrdite sa **„Otpremi avatar“**. Ako nova slika nije učitana, koristite **„Učitaj avatar ponovo“**.

Sačuvano ime i avatar prikazuju se na nalogu. Avatar se čuva odvojeno od izmene imena. Sistem proverava format i dozvoljenu veličinu slike. Email, ulogu i status ne možete menjati kroz sopstveni profil. Za izmenu email adrese kupca obratite se osoblju; nemojte pretpostavljati da isti postupak postoji za naloge osoblja.

## Lozinka i prijavljeni uređaji

Na **„Moj profil“**, u delu **„Promena lozinke“**, unesite **„Trenutna lozinka“**, **„Nova lozinka“** i **„Potvrda nove lozinke“**, pa kliknite **„Promeni lozinku“**. Nova lozinka mora imati 8–100 karaktera i razlikovati se od trenutne. Promena opoziva postojeće prijave; računajte na ponovnu prijavu novom lozinkom kada je aplikacija zatraži. Posle greške polja lozinki se prazne.

Za pregled prijava otvorite **„Moj nalog“ → „Bezbednost i prijavljeni uređaji“**:

1. Proverite uređaje i poslednju aktivnost; trenutni uređaj je posebno označen.
2. Izaberite **„Odjavi uređaj“** i potvrdite ako neku prijavu želite da prekinete.
3. Za prekid svih prijava koristite **„Odjavi sve sesije“**. To uključuje i uređaj koji upravo koristite.
4. Otvorite **„Bezbednosna istorija“** za dostupne događaje i filtere.

Ovo su prijave na vaš nalog, odvojene od gaming sesija i upravljanja tuđim nalozima.

## Obaveštenja

Zvonce u zaglavlju otvara **„Obaveštenja“**. Broj uz zvonce označava nepročitane stavke.

1. Otvorite zvonce i pregledajte poruke.
2. Ako poruka ima povezanu akciju, kliknite je da otvorite odgovarajući dozvoljeni sadržaj.
3. Koristite **„Označi pročitano“** za jednu poruku ili **„Pročitaj sve“** za sve.
4. U **„Podešavanja obaveštenja“** promenite kanale **„U aplikaciji“** i **„Email“** za ponuđene vrste poruka, pa kliknite **„Sačuvaj promene“**.

Rezultat je sačuvan izbor načina obaveštavanja. **„Obavezno“** bezbednosno obaveštenje ne može se isključiti. Ako je čuvanje delimično neuspešno, proverite označene stavke i ponovite čuvanje preostalih izmena. **„Odbaci izmene“** vraća sačuvane vrednosti.

Email kanal u ovoj implementaciji koristi probnu isporuku i ne garantuje prijem stvarnog email-a. Za termine, ponude i narudžbine proveravajte samu aplikaciju. Kada veza uživo nije dostupna, centar pokušava periodično osvežavanje. Obaveštenje ne daje pristup podacima za koje više nemate pravo.

## Pretraga, filteri i prikaz

Otvorite **„Globalna pretraga“** u zaglavlju ili pritisnite **Ctrl+K** odnosno **Cmd+K**. Unesite naziv, email, status ili identifikator i izaberite rezultat. Strelice menjaju izbor, a Enter otvara izabranu stavku. Zvezdica dodaje ili uklanja omiljenu stavku. Rezultati i otvaranje zavise od prava naloga.

Na listama koristite ponuđenu pretragu, statuse, datume, sortiranje i izbor broja redova. Ako nema rezultata, prvo uklonite filtere. Dugme **„Osveži“** ili **„Pokušaj ponovo“**, tamo gde je prikazano, ponovo učitava podatke.

Gde postoji deo **„Sačuvani prikazi“**, prvo podesite filtere, zatim izaberite **„Sačuvaj prikaz“** i unesite naziv. Kasnije ga birate kroz **„Sačuvani prikaz“**. Sačuvani prikaz čuva izbor filtera, ne kopiju podataka i ne dodatne dozvole.

U **„Moj nalog“** možete izabrati **„Tema“** - „Tamna“ ili „Svetla“ - i **„Prikaz“** - „Komforan“ ili „Kompaktan“.

## Prekid veze i neizvestan ishod

Offline poruka ili upozorenje da su podaci iz lokalne memorije znači da pregled može biti zastareo. Ako je ograničeni offline pregled uključen i postoje sačuvani podaci, deo sadržaja ostaje dostupan samo za čitanje. Slanje izmena zahteva vezu; nema automatskog slanja svih akcija kada se ona vrati.

Ako posle slanja sistem ne zna da li je akcija sačuvana, pratite ponuđeno dugme **„Ponovi isti zahtev“**, **„Proveri prethodno slanje“**, **„Proveri prethodnu komandu“** ili **„Pokušaj ponovo“** u tom postupku. Ne započinjite novu istu akciju u drugom prozoru. Zaključana polja sprečavaju promenu zahteva dok se njegov ishod ne proveri.

Ako piše da je podatak u međuvremenu promenjen, osvežite ga, ponovo proverite stanje i izaberite trenutno dozvoljenu akciju. Rezultat grupne akcije proverite po stavkama: neke mogu uspeti, a druge ostati nepromenjene.

Kada se pojavi **„Nova verzija je spremna“**, sačuvajte unose i rešite otvorene zahteve i jednokratne kodove, pa izaberite **„Ažuriraj“**. To ponovo učitava aplikaciju.

---

[Vlasnik](OWNER.md) · [Administrator](ADMIN.md) · [Zaposleni](EMPLOYEE.md) · [Kupac](CUSTOMER.md) · [FAQ](FAQ.md)
