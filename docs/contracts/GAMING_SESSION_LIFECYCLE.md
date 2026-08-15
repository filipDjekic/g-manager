# Gaming session lifecycle

Stage 4 uvodi autoritativni `GamingSession` agregat za rad zaposlenih. Vreme servera
je jedini izvor istine; frontend ne menja status na osnovu lokalnog tajmera.

## Stanja i prelazi

| Trenutno stanje | Komanda | Novo stanje | Efekat |
| --- | --- | --- | --- |
| nema sesije | start | `ACTIVE` | Postavlja `startedAt` i `endsAt` iz backend `Clock`-a. |
| `ACTIVE` | extend | `ACTIVE` | Menja `endsAt` istog agregata; ne kreira novu sesiju. |
| `ACTIVE` | terminate | `TERMINATED` | Zahteva razlog i postavlja `endedAt` iz backend `Clock`-a. |

`EXPIRED` je terminalno stanje koje Stage 5 worker postavlja kada `endsAt` više nije
u budućnosti. Worker zaključava dospele redove u batch-u i ponovljeno izvršenje je
bez efekta. Terminalna sesija se ne može produžiti niti ponovo završiti.

Start transakcija zaključava customer red pre resource reda. Nakon zaključavanja
ponovo proverava customer, station readiness, location scope i postojeću aktivnu
sesiju za customer i station. Ovaj redosled je obavezan za sve buduće start tokove.
Extension i termination zaključavaju session red i zahtevaju aktuelnu `version`.

## Employee API

Osnovna putanja je `/api/v1/gaming-sessions`.

- `POST /` — start; telo: `customerId`, `resourceId`, opciono `reservationId` i
  `durationMinutes`; zahteva `GAMING_SESSION_START`.
- `POST /{id}/extend` — telo: `minutes`, `version`; zahteva
  `GAMING_SESSION_EXTEND`.
- `POST /{id}/terminate` — telo: `reason`, `version`; zahteva
  `GAMING_SESSION_TERMINATE`.
- `GET /{id}` i `GET /` — detalj i aktivne sesije dostupne actor-ovom location
  scope-u; zahtevaju `GAMING_SESSION_READ`.

Sve POST komande zahtevaju `Idempotency-Key`. Ponovljen identičan zahtev vraća
sačuvan odgovor; ponovna upotreba ključa za drugačiji zahtev se odbija. Customer
uloga nema nijednu management permission.

Svaki response sadrži apsolutni `endsAt`, `serverTime` i izvedeni
`remainingSeconds`. UI može lokalno interpolirati prikaz od primljenog
`serverTime`, ali pri osvežavanju uvek prihvata backend vrednost.

## Audit i događaji

Uspešne promene pišu management audit zapise i outbox događaje:

- `GAMING_SESSION_STARTED`
- `GAMING_SESSION_EXTENDED`
- `GAMING_SESSION_TERMINATED`
- `GAMING_SESSION_EXPIRED`

Payload ne sadrži tajne. Start beleži customer, resource, location i kraj;
extension prethodni i novi kraj; termination vreme završetka i razlog.
