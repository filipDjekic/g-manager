# Stage 4 — Customer slot booking

Stage 4 zamenjuje ručni unos datuma i vremena vođenim tokom: usluga, zaposleni ili bilo koji slobodan zaposleni, datum, stvarno dostupan termin, napomena i potvrda.

Frontend učitava termine preko postojećeg `GET /api/v1/availability` ugovora iz Stage-a 3. Prikazuje loading, retry i empty stanja, a kreiranje rezervacije šalje tačan instant iz izabranog slota. Postojeći idempotency ključ i zaštita od dvostrukog slanja ostaju aktivni. Kod konflikta `409` izabrani slot se poništava, dostupnost se ponovo učitava i korisnik dobija poruku da izabere drugi termin.

`employeeId` je opcioni deo zahteva. Kada je naveden, backend zaključava i ponovo proverava tog zaposlenog. Kada nije naveden, backend pesimistički zaključava aktivne zaposlene u stabilnom redosledu i bira prvog koji je dostupan, pa ga trajno upisuje u rezervaciju. Tako create operacija ostaje autoritativna i sprečava rezervaciju zastarelog slota.

Nije potrebna migracija baze: postojeći model rezervacije već čuva konkretnog zaposlenog, a izbor „bilo koji“ se razrešava pre upisa.

Relevantna pokrivenost obuhvata availability/create integraciju, deterministički izbor zaposlenog, komponentna loading/empty/retry stanja, izbor slota tastaturom i E2E oporavak od konflikta na desktop i mobilnom projektu.

Stage 4 ne menja upravljanje rezervacijama zaposlenih niti druge tokove planirane za naredne stage-ove.
