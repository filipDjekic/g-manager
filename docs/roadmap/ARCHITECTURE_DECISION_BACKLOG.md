# G-Manager — backlog arhitektonskih odluka

Ovaj dokument sadrži odluke koje ne treba preuranjeno zaključati. Svaka odluka
se rešava kratkim ADR-om u navedenom stage-u, na osnovu merenja i tadašnjeg
obima. „Preporučeno“ nije dozvola da se tehnologija uvede ranije.

| ID | Problem i opcije | Preporučena opcija i argumenti | Posledice | Stage |
|---|---|---|---|---|
| ADR-01 | Dubina modularizacije: package-by-feature, Spring Modulith ili više Maven modula | Zadržati jedan deployable modularni monolit; koristiti ArchUnit, a Spring Modulith samo ako events/modul testovi daju vrednost. Sistem je premali za mikroservise. | Postepena izolacija bez rewrite-a; budući split ostaje moguć. | 2 |
| ADR-02 | Mapiranje: ručno ili MapStruct | Standardizovati jednostavno ručno mapiranje ili dosledno MapStruct; ukloniti dependency ako nema jasnu korist. Ne održavati mešoviti pristup. | Manje boilerplate-a ili manji build surface; odluka se beleži ADR-om. | 2 |
| ADR-03 | Baza: ostati na MySQL ili migrirati na PostgreSQL | Ostati na MySQL 8.4; kod, Compose i Flyway su već MySQL. Migracija nema poslovno opravdanje. | Dokumentacija i testovi se usklađuju; PostgreSQL GIN ide van plana. | 3 |
| ADR-04 | API response envelope za uspešne odgovore | Ne uvoditi generički envelope; zadržati typed DTO i `PageResponse`, standardizovati samo error i metadata. | Manje breaking change-a i jednostavniji klijenti. | 4 |
| ADR-05 | RBAC naspram permission modela | Role ostaju agregati permissions; backend proverava imenovane permissions i resource policy. | Lakše širenje bez role eksplozije; zahteva migraciju permission tabela. | 5 |
| ADR-06 | Access token revocation | Kratak access token + server-side refresh sesije; ne praviti JWT blacklist bez zahteva za trenutni logout access tokena. | Najviše 15 min prozor; manje state-a i čišćenja. | 6 |
| ADR-07 | Audit skladište | Append-only relaciona `audit_events` tabela sa redigovanim JSON metadata; ne koristiti aplikacione logove kao audit. | Query/export i retention; dodatni storage i permission zahtevi. | 7 |
| ADR-08 | Soft delete obim | Soft delete samo za user/catalog i buduće konfiguracione resurse; finansijske/operativne zapise čuvati immutable/statusno. | Jedinstveni filteri i restore pravila; bez univerzalnog `deleted_at`. | 7 |
| ADR-09 | Test DB | Testcontainers MySQL za migracije/repository/concurrency; H2 ostaje za brze context/unit integracije gde dialect nije bitan. | Sporiji specifični suite, znatno veća vernost. | 9 |
| ADR-10 | Event model i CQRS | In-process domain events + transactional outbox. Bez punog CQRS-a; read projekcije samo za dokazano skupe dashboard/report upite. | Pouzdani side-effect-i bez dva modela svuda. | 11 |
| ADR-11 | Queue sistem | Prvo DB outbox worker. RabbitMQ/Kafka tek kada throughput, nezavisni consumer ili cross-service zahtev to opravda. | Jednostavnije operacije sada; kompatibilan event envelope za kasniji broker. | 11 |
| ADR-12 | Redis | Ne uvoditi za generički cache. Razmotriti za distributed rate limit/lock i kratkotrajni cache tek uz multi-instance deployment. | Nema nepotrebne infrastrukture; jasni trigger kriterijumi. | 13/24 |
| ADR-13 | Error tracking | Početno OpenTelemetry-kompatibilni log/metric standard; Sentry opciono nakon privacy/cost procene. | Vendor-neutral osnova; eventualni SDK sa redakcijom. | 12 |
| ADR-14 | Tracing | Request/correlation ID sada; OpenTelemetry tracing kada se uvedu worker/spoljni servisi. | Izbegava beskoristan tracing jednog procesa, čuva kompatibilnost. | 12 |
| ADR-15 | Design system | Repo-native React komponente + CSS design tokeni; ne uvoditi veliki UI framework bez prototipa. | Kontrola izgleda i bundle-a; veća interna odgovornost za a11y. | 14 |
| ADR-16 | Chart biblioteka | Zadržati Recharts i izgraditi accessible wrapper/tabelarni fallback; evaluirati promenu samo ako nedostaje traženi chart. | Nema migracije postojećeg dashboarda. | 18 |
| ADR-17 | Real-time transport | SSE za server→client notifikacije/status poslova; WebSocket samo ako se potvrdi bidirekcionalna saradnja/presence. | Jednostavniji reconnect i proxy setup; nema lažne collaborative editing funkcije. | 19 |
| ADR-18 | Dokument storage | Interfejs storage-a; local za dev, S3-kompatibilni object storage za produkciju. DB čuva metadata, ne blob. | Horizontalno skaliranje, signed/private download; migracija postojećih slika. | 20 |
| ADR-19 | Antivirus/malware scanning | Asinhroni quarantine + ClamAV ili cloud scanner pre dostupnosti dokumenta. | Dokument nije dostupan dok scan ne prođe; operativni dependency. | 20 |
| ADR-20 | Report engine | HTML template → PDF renderer, streaming CSV i Apache POI SXSSF za XLSX; generisanje kao job. | Kontrolisana memorija i status/preuzimanje. | 21 |
| ADR-21 | Workflow engine | Prvo eksplicitne state machine klase/tabele za jedan approval use case; bez Camunda/Temporal-a dok nema više složenih tokova. | Manji operativni teret; jasna tačka za reevaluaciju. | 22 |
| ADR-22 | Offline strategija | Read-only cache + eksplicitni draft/outbox samo za odabrane forme; bez offline izmena kritičnih statusa. | Manje konflikata i sigurnosnog rizika. | 23 |
| ADR-23 | Multi-tenancy | Ako nastane potreba: shared schema + obavezni `tenant_id`, tenant-aware repo/security/audit; schema-per-tenant samo za regulatornu izolaciju. | Velika migracija i test matrica; ne implementirati spekulativno. | 24 |
| ADR-24 | Feature flags | Typed server-side flags sa environment/default konfiguracijom; per-tenant flags tek uz multi-tenancy. | Bez runtime SaaS dependency-ja u početku. | 24 |
| ADR-25 | Plugin sistem | Stabilni application portovi i event contracts pre bilo kakvog runtime plugina; preferirati compile-time module extension. | Bez proizvoljnog koda i classloader rizika. | 26 |
| ADR-26 | AI provider i podaci | Provider-neutral port, opt-in, redakcija i audit; ne slati osetljive podatke bez pravne/security odluke. | AI ostaje opcioni consumer stabilnih read modela. | 26 |

## Zatvorene odluke

- ADR-01 je prihvaćen kroz
  [`ADR-001-MODULAR-MONOLITH.md`](../architecture/decisions/ADR-001-MODULAR-MONOLITH.md).
- ADR-02 je prihvaćen kroz
  [`ADR-002-EXPLICIT-MAPPING.md`](../architecture/decisions/ADR-002-EXPLICIT-MAPPING.md).
- ADR-03 je zatvoren odlukom da MySQL 8.4 ostaje produkcijska i migration-test
  baza; H2 ostaje samo brzi test double.

## Obavezni sadržaj budućeg ADR-a

Svaki zatvoren zapis mora navesti kontekst, pokretač odluke, razmatrane opcije,
izabranu opciju, security/privacy posledice, operativni trošak, migracioni i
rollback plan, metriku uspeha i datum ponovne evaluacije.
