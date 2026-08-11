# Stage 6 — Employee Today workspace

Stage 6 pretvara početnu employee stranicu u radnu površinu „Moj radni dan“. Postojeći `GET /api/v1/dashboard/today` sada vraća poslovni datum i zonu, današnje termine autentifikovanog zaposlenog, slobodne intervale u radnom vremenu, nepreuzete narudžbine, njegove narudžbine u obradi i današnja nepročitana obaveštenja.

Projekcija nema parametar datuma: granice dana određuje server u `Europe/Belgrade` zoni pomoću aplikacionog sata. Time klijent ne može da proširi scope niti da vidi termine drugog zaposlenog. DST dani koriste stvarne poslovne ponoći, uključujući dan od 23 ili 25 sati.

Svaki termin i svaka narudžbina nose samo akcije dozvoljene za trenutno stanje. Frontend koristi postojeće reservation/order transition API-je, nakon akcije ponovo učitava autoritativnu Today projekciju i prikazuje grešku konflikta bez lokalnog nagađanja stanja.

Slobodni intervali se računaju na backendu iz podešenog radnog vremena i rezervacija koje blokiraju vreme. Otkazane i odbijene rezervacije ne zatvaraju interval. Ako radni dan nije podešen, intervali su prazni.

Nije potrebna migracija: koriste se postojeći indeksi za rezervacije, statuse/dodelu narudžbina i recipient/read vreme obaveštenja. Stage 6 ne uvodi management attention metrike iz Stage-a 7.
