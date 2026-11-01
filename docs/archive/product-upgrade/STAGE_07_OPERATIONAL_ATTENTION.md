# Stage 7 - Operational dashboard / Needs attention


> **Istorijski dokument.** Sačuvan radi projektantskog konteksta i ranijih nalaza. Opisi, komande i rezultati u nastavku nisu potvrda trenutnog ponašanja niti važeće operativno uputstvo. Koristite [aktuelnu dokumentaciju](../../README.md) i [nalaze pregleda od 1. novembra 2026.](../../MAINTENANCE_AUDIT.md).

Stage 7 dodaje management pregled „Zahteva pažnju“ iznad postojećih analitičkih widgeta. Analitika, filteri, CSV i pristupačni tabelarni fallback ostaju nepromenjeni.

Novi `GET /api/v1/dashboard/attention` endpoint dostupan je samo korisnicima sa `DASHBOARD_SUMMARY` dozvolom. Server koristi trenutni poslovni datum u zoni `Europe/Belgrade` i vraća stavke sa ključem, nazivom, eksplicitnom definicijom, brojem, severity oznakom i autorizovanim drill-down URL-om.

Definicije:

- rezervacije na čekanju/otkazane: trenutni status, uz početak termina unutar današnjeg poslovnog dana;
- sledeći termini: najviše pet današnjih PENDING ili CONFIRMED termina čiji početak nije prošao;
- nepreuzete narudžbine: sve CREATED narudžbine bez handlera;
- narudžbine u obradi: sve trenutno IN_PROGRESS narudžbine;
- visoko opterećenje: potvrđeni i završeni rezervisani minuti prema podešenom radnom kapacitetu, iznad korisnikovog workload praga ili podrazumevanih 80%.

Svaka prikazana stavka vodi na postojeću `/reservations` ili `/orders` operativnu stranicu sa odgovarajućim filterima. Backend ograničava projekciju na pet sledećih termina i deset workload upozorenja i meri trajanje preko `gm.dashboard.query.duration{query="attention"}`.

Nova migracija nije potrebna. Upiti ponovo koriste postojeće `idx_reservation_status_time`, `idx_reservation_employee_time`, `idx_orders_status_created` i `idx_orders_handler_status_created` indekse. MySQL `EXPLAIN` zahteva aktivan MySQL runtime; funkcionalni H2 testovi potvrđuju semantiku, ali nisu zamena za produkcioni execution plan.

Stage 7 ne uvodi Customer 360 podatke niti bilo koji deo Stage-a 8.
