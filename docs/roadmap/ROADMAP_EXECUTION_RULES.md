# Pravila izvršavanja G-Manager roadmap-a

## Autoritativni izvori

`MASTER_IMPLEMENTATION_ROADMAP.md` je autoritativan za obim stage-a, a kod i
testovi su autoritativni za trenutno stanje. `STAGE_DEPENDENCY_MAP.md` određuje
zavisnosti. Ako se dokument i kod razilaze, zadržava se cilj stage-a, obim se
prilagođava sadašnjem kodu i odstupanje se dokumentuje.

## Postupak za komandu „Izvrši kompletan Stage N“

1. Pronaći Stage N u master roadmap-u i pročitati ga u celosti.
2. Pročitati direktne i tranzitivne zavisnosti u dependency mapi.
3. U kodu potvrditi da su preduslovi zaista implementirani; oznaka u dokumentu
   sama nije dokaz.
4. Pregledati status radnog stabla i sačuvati sve korisničke/nevezane izmene.
5. Pregledati relevantne backend, frontend, migration, configuration, test i
   dokumentacione fajlove.
6. Napraviti internu checklistu iz svakog acceptance kriterijuma.
7. Implementirati samo kompletan obim Stage N i njegove minimalne neposredne
   tehničke preduslove.
8. Implementirati backend, frontend, bazu/migracije, konfiguraciju, security,
   observability i dokumentaciju gde ih stage zahteva.
9. Dodati/izmeniti sve testove navedene u stage-u; ne spuštati postojeće
   assertion-e ili preskakati testove radi zelenog build-a.
10. Izvršiti stage-specifične komande iz „Validacija nakon implementacije“, pa
    kompletne relevantne build/lint/typecheck/test provere.
11. Popraviti regresije izazvane stage-om. Ne skrivati neuspeh generičkim
    fallbackom, `skip`, TODO-om ili promenom očekivanja bez poslovnog razloga.
12. Proveriti svaki acceptance kriterijum i Definition of Done pojedinačno.
13. Ažurirati status stage-a tek kada su kriterijumi dokazano ispunjeni.
14. Završni izveštaj mora navesti izmenjene/nove/obrisane fajlove, migracije,
    API i breaking promene, testove, stvarno pokrenute komande i rezultate,
    ograničenja i sva odstupanja.

## Dozvoljene izmene tokom izvršavanja

Dozvoljeno je kreiranje, menjanje, premeštanje i opravdano brisanje fajlova,
refaktorisanje, migracije, dependency/config/Docker/CI promene i backend,
frontend, test i dokumentacione izmene — ali samo u granicama Stage N.

## Zabranjeno

- Preskočiti deo stage-a bez jasnog tehničkog blokatora.
- Označiti stage završenim dok relevantni testovi/build ne prolaze.
- Ostaviti obavezni deo kao TODO, placeholder ili mrtvu granu.
- Implementirati buduće stage-ove koji nisu neposredan preduslov.
- Uvesti nedokumentovan breaking change ili promeniti poslovno pravilo bez
  oslonca u specifikaciji/kodu.
- Obrisati funkcionalnost bez zamene i migracione strategije.
- Tvrditi da je komanda/provera izvršena ako nije.
- Menjati staru Flyway migraciju koja je mogla biti primenjena; dodati novu.
- Commitovati tajne, testne kredencijale kao produkcioni fallback ili `.env`.

## Promene baze

- Svaka promena šeme dobija novu verzionisanu Flyway migraciju.
- Validirati praznu bazu i upgrade sa poslednje podržane verzije na pravi MySQL.
- Navesti backfill, lock/downtime rizik, kompatibilnost aplikacionih verzija i
  rollback/roll-forward plan.
- Destruktivne promene rade se expand/migrate/contract redosledom kroz više
  deploymenta kada produkcioni podaci mogu postojati.

## API i kompatibilnost

- `/api/v1` ostaje kompatibilan unutar roadmap-a osim kada stage eksplicitno
  navodi breaking change.
- Preferirati aditivne DTO promene. Uklanjanje/preimenovanje zahteva novu verziju
  ili dokumentovan prelazni period.
- Error format, status kod, permission i idempotency semantika moraju imati
  contract/integration test.

## Security i privatnost

- Autorizacija se proverava na backendu i resource nivou; frontend guard je samo
  UX.
- Tajne dolaze iz environment/secret managera i ne loguju se.
- Audit/log metadata mora biti redigovan; password, JWT, refresh token, cookie,
  dokument sadržaj i osetljivi poslovni podaci ne ulaze u log.
- Upload se smatra nebezbednim dok MIME/signature/size/path i, kada stage traži,
  malware scan ne prođu.

## Blokatori i odstupanja

Blokator se navodi tek nakon bezbednih in-scope pokušaja. Izveštaj mora navesti
tačan neuspeh, dokaz, pogođene kriterijume i potrebnu eksternu odluku/ovlašćenje.
Ako je potreban mali deo budućeg stage-a, implementira se minimalno i upisuje u
oba stage zapisa. Ako je plan zastareo, zadržava se poslovni cilj, roadmap se
ažurira i razlog se beleži.

## Definition of Done za svaki stage

Pored stage-specifičnih uslova: implementacija radi; backend i frontend build
prolaze kada su pogođeni; relevantni testovi prolaze; migracije rade na praznoj
i postojećoj bazi kada postoje; nema kritičnih regresija; security i UX stanja
su obrađena; dokumentacija je ažurna; nema obaveznih placeholder-a.

## Statusi

Dozvoljeni izvršni statusi su `PLANNED`, `IN_PROGRESS`, `BLOCKED` i `DONE`.
Promena na `DONE` mora u roadmap-u sadržati datum i kratku referencu na
validacione rezultate.
