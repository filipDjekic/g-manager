# Stage 8 — Customer 360

Stage uvodi management-only pregled klijenata preko postojećeg `User` identiteta sa rolom `CUSTOMER`. Nije uveden paralelni profil niti su dodati telefon, posete, CRM beleške ili drugi podaci koje domen trenutno ne poseduje.

`GET /api/v1/customers` vraća paginiranu projekciju klijenata i izračunate KPI vrednosti. Lista koristi grupne upite za rezervacije i narudžbine, pa broj upita ne raste sa veličinom strane. `GET /api/v1/customers/{id}` vraća najnoviju istoriju termina i narudžbina. Pristup imaju samo `OWNER` i `ADMIN` preko `CUSTOMER_READ` dozvole.

Prihod znači zbir samo `COMPLETED` narudžbina. Završeni termini znače rezervacije statusa `COMPLETED`; poslednja aktivnost je najnoviji datum rezervacije ili narudžbine. Klijent bez istorije ima nulte KPI vrednosti i prazne liste.

Nova migracija nije potrebna: postojeći indeksi `idx_reservation_customer_time` (V6) i `idx_orders_customer_created` (V7) pokrivaju uvedene upite, a nema novih poslovnih atributa koji bi opravdali `customer_profiles` tabelu.
