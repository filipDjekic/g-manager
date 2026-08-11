# Stage 10 — Real cart/order flow

Customer korpa se čuva kao verzionisan, user-scoped i šifrovan draft kroz postojeći IndexedDB `clientStorage`. Ponovno učitavanje stranice obnavlja količine, uspešan checkout briše draft, a promena naloga čisti privatne podatke kroz postojeći session purge mehanizam. Nedostupni proizvodi se uklanjaju nakon osvežavanja aktivnog kataloga uz jasnu poruku korisniku.

Checkout i dalje koristi postojeći `POST /api/v1/orders` i obavezni `Idempotency-Key`. Klijent šalje samo `productId` i količinu. Server ponovo učitava aktivan proizvod, odbija uslugu/neaktivan/nepostojeći proizvod, ograničava količinu na 1–999, snima aktuelnu cenu u `order_items.unit_price`, računa `line_total` i `orders.total_price` i atomski čuva narudžbinu. Potvrda u UI prikazuje ukupan iznos iz odgovora servera, ne raniju klijentsku procenu.

Kod konflikta ili neuspeha korpa ostaje dostupna za korekciju i ponovni pokušaj. Za pravi dupli submit postojeći idempotency sloj vraća prethodni odgovor bez nove narudžbine; konflikt istog ključa sa drugačijim payload-om ostaje `409`.

Nova migracija nije potrebna: V7 već poseduje `quantity`, snapshot `unit_price`, `line_total`, server total, constraints i potrebne veze/indekse. Stage ne menja order lifecycle niti management tranzicije.
