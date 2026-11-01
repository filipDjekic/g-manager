# Kreiranje i aktivacija kupca

Customer je postojeći `User` sa rolom `CUSTOMER`; ne postoji paralelni customer identitet.

## Tok

1. Korisnik sa `CUSTOMER_CREATE` poziva `POST /api/v1/customers` sa imenom i email adresom.
2. Backend uvek postavlja rolu `CUSTOMER` i pomoću `SecureRandom` generiše tačno četiri znaka iz `A-Z0-9`, npr. `A7K2`. `activationSecret` i `activationExpiresAt` vraćaju se samo u create odgovoru sa `Cache-Control: no-store`. Osoblje vidi monospace kod, dugme za kopiranje i vreme isteka; vrednost ostaje samo u otvorenom dijalogu.
3. Kod važi tačno jedan sat od generisanja; TTL nije podesiv. Baza čuva samo HMAC-SHA-256 hash sa odvojenim domenom i ključem iz postojećeg `JWT_SECRET`, nikada original. Sve instance moraju koristiti isti ključ. Promena ključa poništava postojeće kodove i zahteva koordinisan deployment. Customer do aktivacije ima nasumičan nepoznat password hash i `must_change_password=true`.
4. Customer poziva javni `POST /api/v1/auth/activate` sa `email`, `activationSecret` (`[A-Z0-9]{4}`) i `password` (8–100 znakova). Frontend ograničava unos koda i automatski pretvara ASCII mala slova u velika. Kod radi samo za dati email. Uspeh atomarno postavlja novu lozinku, konzumira sve kodove naloga i postavlja `must_change_password=false`.
5. Nepostojeći, istekao, iskorišćen i kod drugog email-a/neaktivnog/non-customer naloga vraćaju isti HTTP 400 i `Activation code is invalid or expired`. Frontend prikazuje generičku poruku na srpskom. Tačan trenutak isteka je već nevažeći; rok se proverava i posle čekanja na zaključavanja i hashiranja lozinke.

Javna registracija ne postoji. `EMPLOYEE`, `ADMIN` i `OWNER` imaju uske customer create/update/deactivate dozvole; request nikada ne prima rolu. Puni employee/admin/owner user-management ostaje na postojećem `/api/v1/users` ugovoru.

Aktivacioni podatak predati kupcu kontrolisanim kanalom: ugrađeni email adapter je sandbox, pa API odgovor ne dokazuje poslatu poruku. Videti [bezbednost](../reference/SECURITY_ACCESS.md).

## Zaštita, konkurentnost i zadržavanje

Četiri znaka imaju 1.679.616 kombinacija. Obavezan email vezuje pokušaj za konkretan nalog; samo poznavanje koda nije dovoljno. U postojećoj deljenoj SQL bazi, `customer_activation_guards` atomarno rezerviše pokušaj pre provere koda, u zasebnoj transakciji koja se ne poništava pri neuspešnoj aktivaciji. Nema oslanjanja na memoriju instance ili Redis zavisnosti.

- U fiksnom prozoru od 15 minuta dopušteno je najviše 10 pokušaja po IP adresi, 5 po normalizovanom email-u i 100 ukupno za sve instance. Računaju se svi dopušteni zahtevi, uključujući uspešne i paralelne pokušaje. Email/IP ključevi su HMAC hashirani.
- Prekoračenje vraća HTTP 429. Odbijen zahtev ne produžava blokadu; po isteku prozora pokušaji se ponovo dopuštaju, bez trajnog zaključavanja naloga. Globalni limit ograničava napad sa promenljivim IP/email adresama, uz mogućnost privremenog ograničenja i legitimnih aktivacija tokom napada.
- Generisanje koristi deljeno DB zaključavanje i jedinstveni indeks hash-a. Kolizija ponavlja generisanje (najviše 128 puta, potom HTTP 503); i zadržani istekli/iskorišćeni kodovi isključeni su iz ponovnog izdavanja. Zaključavajuće čitanje vidi poslednje commit-ovane zapise i pod MySQL repeatable-read izolacijom.
- Aktivacija i deaktivacija zaključavaju prvo korisnika, zatim kod; transakcija obuhvata lozinku i konzumiranje. Paralelna aktivacija može uspeti samo jednom.
- `@Scheduled` svake minute briše najviše 1.000 iskorišćenih kodova starijih od sedam dana od `consumed_at` i 1.000 neiskorišćenih kodova starijih od sedam dana od `expires_at`. Prvo čišćenje počinje posle jednog minuta. Indeksi podržavaju oba uslova; aktivni i noviji zapisi ostaju. Istekle IP/email brojače zasebno briše u serijama od 1.000.
- `CUSTOMER_CREATED` i `CUSTOMER_ACTIVATION_ISSUED` ostaju u postojećem auditu; `ACTIVATION_SUCCESS` i dopušteni neuspešni pokušaji (`ACTIVATION_FAILURE`) ostaju u `security_events`. Njihovo zadržavanje je nezavisno od kodova. Payload ne sadrži kod, hash koda ili lozinku. DTO `toString()` rediguje tajne; format koda proverava servis kako kod ne bi završio u Bean Validation logovima odbijenih vrednosti.

## Prelaz sa prethodne verzije

Flyway V42 opoziva sve dotad neiskorišćene duge kodove, uz očuvanje istorije. Oni više ne mogu aktivirati nalog. Već aktivirani nalozi i njihove lozinke ostaju nepromenjeni. `CUSTOMER_ACTIVATION_TTL_HOURS` je uklonjen; rok je uvek jedan sat. Novi zahtev za aktivaciju obavezno sadrži email. Postojeća ograničenja podrške za ponovno izdavanje koda ostaju na snazi.
