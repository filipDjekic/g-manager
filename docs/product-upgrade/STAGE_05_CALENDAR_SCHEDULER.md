# Stage 5 — Calendar/Scheduler

Stage 5 uvodi operativni kalendar rezervacija sa dnevnim, nedeljnim i mesečnim prikazom, navigacijom perioda i opcionim filterom zaposlenog za administratore i vlasnika. Zaposleni automatski dobija isključivo svoje rezervacije.

Backend endpoint `GET /api/v1/reservations/calendar` prima obavezne `from` i `to` datume i opcioni `employeeId`. Raspon je ograničen na najviše 93 dana. Odgovor je projekcija sa imenima zaposlenog, klijenta i usluge, vremenima i statusom. Granice se pretvaraju u instante u poslovnoj zoni `Europe/Belgrade`, a upit vraća rezervacije koje presecaju traženi period.

Frontend koristi isključivo ovu repository projekciju za događaje. Ne računa dostupnost niti slobodne termine. Statusi imaju semantičke tekstualne oznake i boje, događaj otvara postojeći zajednički details Drawer, a mobilni prikaz slaže dane vertikalno.

Postojeći kompozitni indeks `idx_reservation_employee_time (employee_id, status, start_time, end_time)` iz migracije V6 pokriva employee-oriented pristup. Nova migracija nije uvedena jer Stage 5 ne menja model podataka.

Testovi pokrivaju permission scope i employee izolaciju, čitljive projekcije, ograničenje raspona, poslovnu vremensku zonu/DST, navigaciju perioda i desktop/mobile otvaranje detalja.
