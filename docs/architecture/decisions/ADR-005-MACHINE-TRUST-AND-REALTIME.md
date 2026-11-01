# ADR-005: Machine trust, durable polling i Windows granica

Status: prihvaćeno i implementirano u backendu i .NET Client-u; fizički rollout se proverava zasebno.

## Identitet i transport

Browser koristi user JWT/refresh tok. Stanica ima zaseban machine identitet; jednokratni enrollment kod veže njen lokalno generisan Ed25519 public key za stanicu. Backend ne poseduje machine private key. Challenge potpis daje kratkotrajan machine JWT sa station/key-version/audience/scope proverenim prema aktuelnoj bazi.

Customer session login je postojeća machine-scoped operacija koja proverava korisnika aktivne gaming sesije. Nije nova web role niti poseban opšti customer-session JWT principal. Detalji su u [machine ugovoru](../../contracts/MACHINE_ENROLLMENT_AND_PROTOCOL.md).

Browser operativa koristi outbox i SSE. Machine koristi HTTPS snapshot i durable poll sa monotono rastućim cursor-om i idempotentnim ACK-om; WebSocket nije uveden. Duplikati i reconnect se očekuju, a komande ostaju proverljive posle prekida veze.

## Windows granica

Service kao LocalSystem poseduje DPAPI LocalMachine identitet, potpisano stanje i enforcement. Shell radi pod standardnim nalogom, bez private key-a, i koristi named pipe sa peer/identity proverama. Development koristi CurrentUser i nema fizičko sprovođenje.

Konkretna implementacija koristi AppLocker i proveru zaštićenih executable putanja, publisher/hash trust i bounded signed lease. TPM/non-exportable crypto provider i WDAC deployment nisu implementirani mehanizmi ovog Client-a. Lokalni administrator je izvan aplikacione granice zaštite.

| Pretnja | Kontrola u implementaciji |
| --- | --- |
| Ukraden enrollment/challenge | Kratak TTL, hash-at-rest, station scope i jednokratna potrošnja |
| Machine kompromitovanje | Key verzija, revoke/rotation i proveravanje identiteta prema bazi |
| Replay/redosled | Jednokratni potpisani challenge, command sequence, durable cursor i ACK |
| Offline produženje/sat unazad | Potpisan finite lease, monotoni protek i trusted UTC floor |
| Neodobrena aplikacija | Explicit app profile, signed trust, AppLocker i player SID scope |
| Tampered update | HTTPS, SHA-256, Authenticode publisher pin i CMS file manifest |

Backend policy signing ključ i Windows code-signing sertifikat su zasebne tajne od machine ključa. Produkcioni TLS i signing materijal ostaju izvan repozitorijuma. [Client vodič](../../operations/WINDOWS_CLIENT.md) i [rollout](../../operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md) navode konkretne operacije i granice dokaza.
