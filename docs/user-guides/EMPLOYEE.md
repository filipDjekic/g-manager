# Uputstvo za zaposlenog - EMPLOYEE

[Indeks uputstava](README.md) · [Vlasnik](OWNER.md) · [Administrator](ADMIN.md) · [Kupac](CUSTOMER.md) · [FAQ](FAQ.md)

Zaposleni svakodnevno radi sa klijentima, rezervacijama, gaming sesijama i narudžbinama. Za stanice i rezervacije važi **dodela konkretnog resursa**: videti računar u nekom pregledu ne znači da njime možete upravljati. Dodele uređuju vlasnik ili administrator.

## Prijava i početak rada

Nalog i početnu lozinku dobijate od vlasnika ili administratora. Prijavite se postupkom [Prijava i odjava](README.md#prijava-i-odjava). Za ime, avatar, sopstvenu lozinku, prijavljene uređaje i obaveštenja koristite [zajedničko uputstvo za nalog](README.md).

1. Otvorite **„Radni ekran“**, koji je uobičajeni početni ekran zaposlenog.
2. Proverite stanje veze i vreme poslednje provere. Ako je prikaz zastareo, kliknite **„Osveži“**.
3. Pregledajte **„Spremni“**, **„Aktivni“** i **„Za proveru“**. Brojači **„Ističu ≤10 min“** i **„Bez potvrđene veze“** pomažu da izdvojite hitne stavke.
4. Ispod računara pogledajte **„Današnji termini“** i **„Narudžbine koje čekaju“**.
5. Za širi dnevni prikaz otvorite **„Ceo dnevni pregled i važni događaji“**.

**Rezultat:** znate kojim računarima možete upravljati i koje obaveze zahtevaju pažnju. Dugme **„Raspored“** vodi u kalendar, a „Sve narudžbine“ na obradu narudžbina.

**Ograničenja:** aplikacija nema prijavu početka ili završetka smene, evidenciju prisustva niti uređivač smenskog rasporeda. Prijava na nalog nije početak evidentirane smene. „Slobodni intervali dnevnog rasporeda“ ne potvrđuju da je konkretan računar slobodan.

Bočni meni sadrži **„Radni ekran“**, **„Rezervacije“**, **„Narudžbine“**, **„Klijenti“** i **„Alati“**. „Alati“ obuhvataju „Ponuda“, „Mapa dostupnosti“, „Informacije o stanicama“ i „Izveštaji“ kada su uključeni.

## Rad sa klijentima

### Pronalaženje i kreiranje naloga

Stranica **„Klijenti“** služi pronalaženju osobe, pregledu istorije i pripremi gaming sesije.

1. Prvo pretražite postojećeg klijenta po imenu ili email adresi. Filter **„Status“** prikazuje aktivne ili neaktivne naloge.
2. Ako nalog ne postoji, kliknite **„Novi klijent“**.
3. Unesite **„Ime i prezime“** i **„Email adresa“**, pa izaberite **„Kreiraj klijenta“**.
4. U potvrdi pročitajte rok aktivacije. Kliknite **„Kopiraj kod“** ili ručno kopirajte prikazani „Aktivacioni kod“ i predajte ga klijentu.
5. Objasnite da na stranici prijave treba otvoriti **„Aktivirajte nalog“**, uneti kod i izabrati lozinku.
6. Zatvorite potvrdu kada je kod preuzet. Ako je kreiranje otvoreno tokom pripreme sesije, koristite **„Kod je predat - nastavi sesiju“**.

**Rezultat:** klijent ima nalog i jednokratni kod; web prijava je moguća tek posle aktivacije. Kreiran aktivan nalog može se koristiti za operativni izbor klijenta i pre aktivacije, ali prijava na njegov nalog i na Gaming Client zahteva aktivaciju.

**Ograničenja:** isti email ne može se ponovo koristiti za kreiranje. Kod je prikazan samo u potvrdi kreiranja i važi do naznačenog roka. Nema dugmeta za ponovno čitanje ili izdavanje koda. Ako nedostaje ili je istekao, zatražite proveru od administratora; nemojte obećavati automatsko ponovno slanje email-a.

### Profil, izmena i deaktiviranje

1. Kliknite ime klijenta ili meni **„Akcije za klijenta…“ → „Prikaži profil“**.
2. Pregledajte osnovne podatke i ponuđenu istoriju rezervacija, gaming sesija i narudžbina. Gaming istorija poštuje vaš dodeljeni opseg.
3. Za ime ili email izaberite **„Izmeni podatke“**, promenite podatke i kliknite **„Sačuvaj podatke“**.
4. Ako treba isključiti pristup, izaberite **„Deaktiviraj klijenta“** i potvrdite u otvorenom prozoru.

**Rezultat:** izmenjeni podaci su sačuvani, odnosno klijentu je isključen pristup nalogu. Deaktiviranje prekida njegove prijave i poništava neiskorišćene aktivacione kodove. Nije isto što i otkazivanje pojedinačne rezervacije ili završavanje gaming sesije; te stavke zasebno proverite.

Možete menjati samo ime i email klijenta, ne njegovu ulogu ili lozinku. Nemate pristup kartici „CRM“, internim beleškama i tagovima. Ne postoji opšta akcija ponovnog aktiviranja klijenta na ovoj stranici.

## Kalendar i rezervacije

**„Rezervacije“** u bočnom meniju otvara stranicu **„Kalendar“**. Dodatna navigacija ima **„Raspored“**, **„Lista“** i **„Čekanje“**.

### Pregled obaveza i dostupnosti

1. U „Raspored“ izaberite datum ili **„Danas“**, a strelicama prethodni ili sledeći period.
2. Izaberite prikaz **„Dan“**, **„Nedelja“**, **„Mesec“** ili **„Lista“**.
3. U **„Filteri rasporeda“** po potrebi odaberite lokal, zonu, zaposlenog, resurs i status. „Više filtera“ omogućava izbor klijenta.
4. Koristite **„Moje stanice“** za rezervacije trenutno dodeljenih resursa. **„Sve stanice“** proširuje pregled radi uvida u zauzetost.
5. Kliknite događaj ili **„Detalji“** za pojedinačnu rezervaciju.

**Rezultat:** pregled termina u izabranom prostoru i periodu. Dnevni i nedeljni raspored prikazuju i kontekst resursa i zauzetosti; prazan deo nije sam po sebi potvrda da novi zahtev može biti sačuvan.

**Ograničenja:** kod nedodeljenih resursa pregled je samo za čitanje; lični detalji klijenta i napomene mogu biti skriveni. „Sve stanice“ ne dodeljuje ovlašćenje. Za sopstvene termine usluge bez fizičkog resursa postoji poseban dozvoljeni opseg; pratite ponuđene akcije.

### Nova rezervacija za klijenta

1. U kalendaru ili na listi kliknite **„Nova rezervacija“**.
2. Pronađite i izaberite klijenta. Ako nema nalog, prvo ga kreirajte kroz „Klijenti“.
3. Izaberite **„Usluga“** i konkretnog zaposlenog ili **„Automatski slobodan zaposleni“**.
4. Ako usluga zahteva prostor, izaberite **„Lokal“** i **„Zona“**. Izaberite konkretan resurs ili automatsku dodelu slobodnog resursa u toj zoni. Možete upravljati samo dodeljenim resursima.
5. Unesite **„Datum rezervacije“**, **„Od“** i **„Do“**. Za termin preko ponoći promenite i **„Datum završetka“**, kada usluga dozvoljava promenljivo trajanje.
6. Proverite obračunato trajanje, poruku **„Dostupnost celog intervala“** i prikaz zauzetosti. Ako je ponuđena alternativa, možete je izabrati.
7. Po želji unesite „Napomena“ i kliknite **„Kreiraj rezervaciju“**.

**Rezultat:** nastaje rezervacija **„Na čekanju“** i otvaraju se njeni detalji. Potvrda je zaseban korak. Sistem pri čuvanju ponovo proverava zaposlenog, radno vreme, odsustva, resurs, rezervacije i aktivne sesije.

**Ograničenja:** termin mora biti u budućnosti. Kod fiksne usluge kraj se računa iz trajanja. Gaming usluge sa promenljivim trajanjem prikazuju dozvoljeni opseg; rezervacija i aktivna gaming sesija mogu imati različite minimalne vrednosti. Ako je formular blokiran zbog nedodeljenih stanica, tražite dodelu konkretnog resursa. Za ishod koji nije potvrđen koristite **„Ponovi isti zahtev“** u istom formularu.

### Potvrda, odbijanje, izmena i otkazivanje

Na „Lista“ pronađite rezervaciju pretragom, periodom i statusom. Meni **„⋯“** u redu i detalji nude trenutno dozvoljene akcije.

| Trenutni status | Moguće akcije kada imate pravo upravljanja |
| --- | --- |
| Na čekanju | „Potvrdi“, „Odbij“ ili „Otkaži“; izmena budućeg termina |
| Potvrđena | „Otkaži“; izmena budućeg termina; „Završi“ tek kada planirani termin istekne |
| Odbijena, Otkazana, Završena | Pregled istorije; nema vraćanja u prethodni status |

Za potvrdu otvorite rezervaciju i kliknite **„Potvrdi“**. Potvrđivanje je moguće pre početka termina; obavezni fizički resurs mora biti dodeljen. Ako resurs nedostaje i nemate dozvoljenu akciju dodele, pozovite administratora ili vlasnika.

Za izmenu:

1. U redu izaberite **„Izmeni rezervaciju“**, odnosno u detaljima **„Izmeni vreme ili stanicu“** ili „Izmeni“, zavisno od prikaza.
2. Promenite **„Datum i vreme (Europe/Belgrade)“**, **„Računar / resurs“** i/ili „Napomena“.
3. Sačekajte proveru slobodnih resursa i izaberite **„Sačuvaj izmene“**.

**Rezultat:** buduća aktivna rezervacija dobija novi početak ili resurs. Klijent, usluga i trajanje ostaju isti. Za premeštanje morate imati pravo i nad izvornim i nad ciljnim resursom. Izmena se odbija ako rezervacija ima aktivnu gaming sesiju ili se podaci/dostupnost u međuvremenu promene.

Za otkazivanje ili odbijanje izaberite **„Otkaži“** odnosno **„Odbij“**, unesite **„Razlog“** i potvrdite istoimenu akciju. Status se menja i ostaje zabeležen u **„Istorija rezervacije“**. Rok koji ograničava kupčevo otkazivanje ne primenjuje se na isti način na ovlašćeno osoblje.

Za više rezervacija označite dozvoljene redove i koristite **„Potvrdi izabrane“** ili **„Otkaži izabrane“**. Za otkazivanje je potreban razlog. Proverite rezultat svake stavke; delimičan uspeh ne znači da je cela grupa promenjena.

### Ponavljajući termini

U formularu nove rezervacije otvorite **„Ponavljanje i napredne opcije“** i uključite **„Ponavljajuća rezervacija“**.

1. Izaberite konkretnog zaposlenog.
2. Podesite **„Učestalost“** - „Nedeljno“ ili „Mesečno“ - **„Interval“** od 1 do 4 i **„Broj termina“** od 2 do 20.
3. U „Konflikti“ odaberite **„Kreiraj samo ako su svi termini slobodni“** ili **„Preskoči zauzete termine“**.
4. Proverite pregled dostupnosti svake pojave, kliknite **„Pregled serije“**, proverite podatke, pa **„Kreiraj rezervaciju“**.
5. Pročitajte broj kreiranih i preskočenih termina; preko **„Otvori kreiranu rezervaciju“** otvorite jednu od sačuvanih rezervacija.

**Rezultat:** kreira se dozvoljena serija zahteva. Svaki termin posebno prolazi proveru dostupnosti. Pregled nije garancija da stanje neće biti promenjeno pre slanja. Dalje menjajte konkretne rezervacije; nema korisničke akcije za izmenu cele serije odjednom.

## Lista čekanja

Otvorite **„Rezervacije“ → „Čekanje“**, odnosno **„Lista čekanja“**. Ovde pratite interesovanje za zauzete termine.

1. Izaberite **„Dodaj na listu čekanja“** i klijenta.
2. Odaberite uslugu, zaposlenog, prostor i resurs prema želji klijenta. Unesite **„Željeni datum“** i **„Početak termina“**.
3. Po potrebi unesite **„Interna napomena“** i označite prikazanu saglasnost klijenta.
4. Kliknite **„Dodaj na listu čekanja“**.
5. U detaljima pratite stanje, istoriju i eventualnu ponudu. Dok je prijava na čekanju, ponuđena je **„Izmeni prijavu“**; čekajuću ili ponuđenu prijavu možete otkazati kroz **„Otkaži prijavu“** i potvrdu.

**Rezultat:** prijava čeka oslobađanje termina. Sistem automatski šalje ponudu, a prihvata je klijent u svom nalogu. Osoblje nema dugme da prihvati ponudu umesto njega. Prihvatanje kreira rezervaciju; proverite njen stvarni status kroz **„Pogledaj rezervaciju“**.

**Ograničenja:** lista čekanja je za zauzet termin koji inače ispunjava uslove rezervisanja. Ako je termin slobodan, koristite ponuđeno **„Otvori rezervaciju“**. Zatvoren lokal ili nedostupan resurs ne rešavaju se dodavanjem na listu. Ne možete dodati duplu aktivnu prijavu za isti izbor. Koristi se standardno trajanje usluge.

Vidite i menjate samo prijave u dozvoljenom opsegu. Fleksibilan izbor bez određenog resursa moguć je samo kada ceo izbor ostaje unutar tog opsega; najjednostavnije je odabrati konkretan dodeljeni resurs. Filteri i „Redosled čekanja“ menjaju prikaz, ne redosled kojim sistem automatski nudi termin. Ponuda ima rok; osoblje ga ne produžava kroz ovaj ekran.

## Gaming sesije

Na **„Radni ekran“** pratite dodeljene **PC** stanice. „Mapa dostupnosti“ prikazuje i druge vrste opreme, ali to ne znači da se na njima podržava isti PC postupak upravljanja sesijom.

### Pokretanje

1. Pronađite računar kroz „Spremni“, pretragu ili lokaciju, pa kliknite **„Pokreni sesiju“**. Možete početi i kroz **„+ Nova sesija“**.
2. U **„Pronađi klijenta“** odaberite aktivnog klijenta. Ako je potreban novi nalog, dostupno je **„+ Novi klijent“**; obavezno predajte aktivacioni kod pre nastavka.
3. Ako računar nije već izabran, odaberite **„Slobodna stanica“**.
4. Izaberite ponuđeno trajanje 30, 60, 120 ili 180 minuta, ili unesite **„Trajanje u minutima“** u dozvoljenim granicama.
5. Proverite ime klijenta, računar i trajanje, pa kliknite **„Pokreni za [ime klijenta]“**.

**Rezultat:** aktivna sesija dobija početak i planirani kraj, a stanica prikazuje klijenta i preostalo vreme. Ako je integracija uključena, komanda se šalje Gaming Client-u. Klijent zatim koristi svoj aktiviran nalog na tom računaru.

**Ograničenja:** isti klijent ili računar ne može imati dve aktivne gaming sesije. Stanica mora biti aktivna, dozvoljena za korišćenje, pravilno konfigurisana i slobodna za celo traženo trajanje. Kada je Client integracija uključena, proveravaju se sveža veza, lokalna spremnost i potvrda bezbednog zaključavanja.

Pojedine rezervacije u „Lista“ imaju **„Pokreni sesiju“**. To otvara pokretanje sa povezanim klijentom i resursom. Pokretanje je posebna radnja; rezervacija se ne pretvara automatski u gaming sesiju u zakazani čas. Ako nema ponuđene akcije, proverite status, tip resursa, ovlašćenje i spremnost.

### Produžavanje

1. Na aktivnoj sesiji izaberite **„+30 min“**. Dodatne akcije nude **„+60 min“** i **„Prilagođeno produženje“**; u listi su pod **„Još akcija“**.
2. Za prilagođeno produženje unesite **„Broj minuta“** i kliknite **„Produži sesiju“**.
3. Proverite novi planirani kraj na kartici i potvrdu poslednje komande kada se koristi Gaming Client.

**Rezultat:** vreme se dodaje na postojeći planirani kraj. Produženje mora ostati u dozvoljenim granicama ukupnog trajanja i ne sme preklopiti drugu rezervaciju resursa. Nije dovoljno da računar trenutno deluje slobodno.

### Završavanje i istek

1. Na aktivnoj sesiji kliknite **„Završi“**.
2. Unesite **„Razlog završetka“** i izaberite **„Potvrdi završetak“**.
3. Proverite status i lokalno zaključavanje računara. **„Detalji i istorija“** prikazuju komande, potvrde i događaje.

**Rezultat:** sesija se ručno završava i, uz Client integraciju, šalje se komanda za zaključavanje. Sesija se završava i istekom vremena. Prikaz „0“ ili „Sesija istekla“ može čekati osvežavanje; to nije potvrda da je Windows računar već zaključan.

Završavanje gaming sesije i status rezervacije su odvojeni postupci. Pre predaje računara sledećem klijentu proverite da sistem ponovo nudi „Pokreni sesiju“.

### Nedostupna stanica ili neuspešna komanda

| Prikaz | Postupak |
| --- | --- |
| „Bez veze“ / „Bez potvrđene veze“ | Osvežite i proverite poslednji kontakt. Pozovite administratora da proveri računar i Gaming Client. Nova sesija može biti blokirana. |
| „Održavanje“ / „Van upotrebe“ | Izaberite drugi spreman računar. Zaposleni nema dozvolu za promenu te konfiguracije. |
| Nedostaje profil ili konfiguracija | Pozovite administratora. Pregled „Informacije o stanicama“ može pomoći pri identifikaciji problema. |
| „Čeka zaključavanje“ / komanda bez potvrde | Otvorite „Detalji i istorija“. Ako je ponuđeno, koristite „Ponovo pošalji force-lock“ → „Pošalji komandu“, pa pratite potvrdu. |
| Ponuđeno „Potvrdi fizički lock“ | Najpre fizički proverite da je računar zaista zaključan, zatim potvrdite sa „Provereno je zaključano“. Potvrda se evidentira. |
| Ishod starta, produženja ili kraja nije potvrđen | Upotrebite „Pokušaj ponovo“ u istom startu ili „Proveri prethodnu komandu“ za produženje/kraj. Ne šaljite novu nezavisnu komandu. |
| „Prikaz može biti zastareo“ | Proverite mrežu i „Osveži“. Operativne akcije mogu biti privremeno onemogućene. |

Akcije oporavka prikazuju se samo za odgovarajuće stanje i dozvoljeni resurs. Fizička potvrda nije daljinsko zaključavanje niti popravka mreže. Ako problem ostane, administratoru prosledite oznaku računara, vreme, tekst greške i „Support ID“ iz istorije ako postoji.

## Obrada narudžbina

Otvorite **„Narudžbine“**. Kupci šalju narudžbine proizvoda za preuzimanje; zaposleni ih preuzimaju i obrađuju.

1. Izaberite **„Nepreuzete“** i otvorite narudžbinu ili njen meni akcija.
2. Proverite proizvode i količine, pa izaberite **„Preuzmi narudžbinu“**. Status prelazi iz **„Primljena“** u **„U pripremi“**, a vi postajete zadužena osoba.
3. U **„Moje u obradi“** pronađite narudžbinu i, kada je spremna, izaberite **„Označi kao spremnu“**.
4. Kada klijent preuzme proizvode, izaberite **„Označi kao preuzetu“** i potvrdite završetak. Status postaje **„Završena“**.

**Rezultat:** istorija pokazuje tok prijema, pripreme i preuzimanja. „Spremne“ izdvaja spremne narudžbine, a „Sve“ širi pregled. Dostupni su pretraga, status, period, „Više filtera“, sortiranje, detalji i sačuvani prikazi. Statistika za period nije filtrirana tekstom pretrage i statusom; proverite opis njenog obuhvata.

**Ograničenja prema zaduženju:**

- Nepreuzetu narudžbinu možete preuzeti ili otkazati.
- Narudžbinu „U pripremi“ možete označiti spremnom ili otkazati samo ako ste je vi preuzeli.
- Spremnu narudžbinu možete označiti preuzetom samo ako ste zadužena osoba. Za njeno otkazivanje potrebni su administrator ili vlasnik.
- Završena i otkazana narudžbina nemaju sledeću promenu statusa. Nema prenosa zaduženja ili uređivanja već poslatih stavki kroz ovaj ekran.

Za otkazivanje izaberite **„Otkaži narudžbinu“** i potvrdite. Za više odgovarajućih redova postoje **„Preuzmi izabrane“** i **„Otkaži izabrane“**. Proverite izveštaj o svakoj stavci. Ako je drugu osobu sistem u međuvremenu upisao kao zaduženu, osvežite i postupite prema novim pravima.

Zaposleni nema korisničku korpu za pravljenje narudžbine umesto kupca. Status „Završena“ označava završen tok preuzimanja, ne potvrdu kartičnog ili gotovinskog plaćanja.

## Alati, izveštaji i obaveštenja

U **„Alati“ → „Ponuda“** pregledajte aktivne usluge i proizvode, opis, cene i trajanje usluga. Nemate akcije za promenu ponude ili cena.

**„Mapa dostupnosti“** omogućava izbor lokala, zone i početka intervala, prikaz „Mapa“ ili „Lista“ i detalje resursa. Proverava se jedan sat od izabranog početka. Za PC koristite „Otvori operativu“, a za odgovarajuće ostale resurse „Otvori kalendar“. Nemate uređivanje prostora, mape ili dodela zaposlenih. Mapa nije garancija dostupnosti celog budućeg termina.

**„Informacije o stanicama“** služe pregledu konfiguracije, aplikacija, profila i dostupnosti Client paketa. Kartice i informacije koje vidite ne daju pravo da menjate profil, održavanje, aplikacije, identitet ili dodele.

Ako su **„Izveštaji“** uključeni:

1. Otvorite „Alati“ → „Izveštaji“.
2. Izaberite definiciju, CSV/XLSX/PDF i period; završni datum **nije uključen**.
3. Kliknite „Generiši“, sačekajte „Spreman“ u istoriji i kliknite „Preuzmi“.
4. Po potrebi sačuvajte lični šablon ili otkažite generisanje koje još traje.

Imate izveštaje o narudžbinama, rezervacijama, iznosima po statusu i opterećenju zaposlenih. U podrazumevanoj ulozi njihov obuhvat nije ograničen samo na vaše stanice ili narudžbine. Istorija fajlova i šabloni pripadaju vašem nalogu. Nemate „Zakaži izveštaj“ ni upravljanje rasporedima. Za rokove, fiksne periode šablona i opcioni sažetak pogledajte [izveštaje](OWNER.md#izveštaji-i-automatsko-generisanje).

Zvonce i **„Podešavanja obaveštenja“** koristite prema [zajedničkom postupku](README.md#obaveštenja). Za kvar se obratite administratoru ili vlasniku; nema ugrađene radne poruke/četa za slanje prijave problema iz ovih stranica.
