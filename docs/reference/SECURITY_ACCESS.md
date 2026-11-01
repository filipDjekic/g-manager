# Uloge, pristup i bezbednost

Izvori: [RolePermissions](../../gm/src/main/java/com/game_manager/gm/common/security/RolePermissions.java), [SecurityConfig](../../gm/src/main/java/com/game_manager/gm/bootstrap/SecurityConfig.java), [UserAuthorizationPolicy](../../gm/src/main/java/com/game_manager/gm/user/UserAuthorizationPolicy.java) i [ResourceAccessService](../../gm/src/main/java/com/game_manager/gm/resource/ResourceAccessService.java). Backend je autoritativan; frontend [capabilities](../../frontend/g-manager/src/auth/capabilities.ts) služe navigaciji i prikazu.

## Matrica uloga

| Oblast | CUSTOMER | EMPLOYEE | ADMIN | OWNER |
| --- | --- | --- | --- | --- |
| Sopstveni profil i web sesije | Da | Da | Da | Da |
| Čitanje kataloga/radnog vremena/resursa | Da | Da | Da | Da |
| Katalog i radno vreme - izmene | Ne | Ne | Da | Da |
| Kreiranje rezervacije | Za sebe | U dozvoljenom operativnom scope-u | Da | Da |
| Rezervacije - prikaz/promena | Svoje, dozvoljeno otkazivanje | Scope/assignment i poslovna pravila | Management | Management |
| Pickup order create | Da | Ne | Ne | Ne |
| Order obrada | Sopstveni CREATED može otkazati | Preuzimanje; dalji koraci po handler pravilima | Management | Management |
| Customer create/update/deactivate | Ne | Da, ograničen customer ugovor | Da | Da |
| CRM beleške/tagovi | Ne | Ne | Da | Da |
| Staff user create | Ne | Ne | EMPLOYEE | ADMIN i EMPLOYEE |
| Gaming operativa | Samo own pregled / Client login | Samo dodeljeni resursi | Svi resursi | Svi resursi |
| Station/app profiles/machine identitet | Ne | Čitanje stanica u dozvoljenom scope-u | Upravljanje | Upravljanje |
| Dashboard | Customer prikaz | Operativni | Poslovni i operativni | Poslovni i operativni |
| Izveštaji | Ne | Sopstveni, uz REPORT_READ | Sopstveni + upravljanje rasporedima | Sopstveni + upravljanje rasporedima |
| Audit/metrics/feature management | Ne | Ne | Da, uz dodatnu visibility politiku | Da, uz visibility politiku |

ADMIN i OWNER imaju sličnu permission listu, ali service pravila dodatno štite OWNER i zabranjuju role escalation. OWNER ne kreira novi OWNER kroz `/users`; za prvi nalog postoji bootstrap. Samodeaktivacija je zabranjena. Deaktivacija i soft delete/restore su odvojene operacije.

Employee location dodela nije dovoljna za upravljanje gaming resursom: proveravaju se aktivne `user_resource_assignments`. Bez fizičkog resursa zaposleni može upravljati sopstvenim employee terminima; tuđi termini mogu biti redigovani/read-only. ADMIN/OWNER imaju globalni resource scope. Polje `allowedActions` i management scope odgovori pomažu UI-u da prikaže stvarno dozvoljene radnje.

## Poslovna pravila koja su deo pristupa

Rezervacije imaju `PENDING → CONFIRMED → COMPLETED`, sa granama ka `REJECTED`/`CANCELLED`. Potvrda zahteva budući početak, završetak dostignut kraj, a odbijanje/otkazivanje razlog. Usluga sa `requires_resource` mora imati kompatibilan resurs pre potvrde. CUSTOMER cutoff se odnosi na otkazivanje **CONFIRMED** rezervacije i koristi `CANCELLATION_CUTOFF_MINUTES`; ne primenjivati ga automatski na sva stanja.

Orders prate `CREATED → IN_PROGRESS → READY → COMPLETED`, sa dozvoljenim granama otkazivanja. Preuzimanje postavlja handler-a. EMPLOYEE može završavati sopstveno preuzetu narudžbinu; ADMIN/OWNER imaju šira prava. CUSTOMER ne može otkazivati nakon `CREATED`.

Gaming start/extend/terminate zahtevaju odgovarajući permission i resurs. Terminalna sesija se ne produžava. Operativno potvrđivanje fizičkog lock-a je privilegovana radnja sa audit tragom, a ne obična promena boje kartice.

## Web identitet i zaštita zahteva

- Lozinke se čuvaju kao BCrypt hash; DTO-i ne vraćaju hash.
- Javna registracija je isključena. Osoblje kreira CUSTOMER i jednokratno dobija četvoroznakovni kod (`A-Z0-9`) koji važi jedan sat. Aktivacija zahteva email i novu lozinku; baza čuva samo HMAC-SHA-256 hash. Nema potvrđenog stvarnog email transporta za automatsku dostavu linka. V42 opoziva stare neiskorišćene duge kodove.
- Access JWT traje 15 minuta i frontend ga čuva u memoriji. Refresh token traje 14 dana, ima hash-at-rest i rotaciju; reuse rotiranog tokena opoziva aktivne refresh sesije.
- `gm_refresh` i `gm_csrf` su HttpOnly, SameSite Strict; produkcioni profil fiksira Secure. Refresh/logout zahtevaju `X-XSRF-TOKEN` iz `/auth/csrf`.
- Stateful cookie zaštita i stateless bearer zahtevi nisu isti tok. CORS je eksplicitna allow-list sa credentials podrškom; nije zamena za authorization.
- Aktivacija ima distribuirani SQL limiter: najviše 10 pokušaja po IP-u, 5 po email-u i 100 ukupno u fiksnom prozoru od 15 minuta, nezavisno od backend instance. Odbijeni pokušaji ne produžavaju blokadu. Ostali login/operativni/machine limiteri ostaju u memoriji instance. Detalji su u [ugovoru aktivacije](../contracts/CUSTOMER_ONBOARDING.md).
- Rute koje nisu eksplicitno odobrene završavaju sa deny-all. Servisi ponavljaju ownership/scope provere, uključujući download i deep link otvaranje.

## Javni resursi i observability

Health liveness/readiness i Prometheus su dozvoljeni bez user JWT-a na security filter nivou. U produkciji su na odvojenom management portu; moraju ostati privatni. `/actuator/metrics/**` traži `METRICS_READ`, a `/actuator/info` nije posebno odobren u prikazanom security chain-u. Ne pretpostavljati da exposure automatski daje HTTP pristup.

Lokalni OpenAPI je javan; prod ga isključuje. Javni su i client-package osnovni metapodaci i legacy `/media/**`. `GET /documents/{id}/content?preview=true` može bez auth vratiti samo aktuelnu referenciranu CLEAN PNG/JPEG sliku tipa `USER_AVATAR` ili `CATALOG_IMAGE`. Ostali dokumenti i starije verzije zahtevaju korisnika i policy proveru. `/client-package/availability` i `/download` ostaju zaštićeni station pristupom.

Request ID, centralni `ApiError`, audit i sanitizovani logovi služe podršci. Ne kopirati tokene, cookies, lozinke, enrollment/activation kodove, potpise, dokumente ili private keys u incidente. Runtime bezbednosni header-i postoje u backendu i Nginx-u; njihov stvarni prolaz kroz edge treba proveriti u ciljnom deployment-u.

## Fajlovi i scanner

Document storage koristi interne ključeve, checksum, verzije i scan stanja. Korisničko ime fajla je metapodatak, ne proizvoljna putanja. Upload MIME se poredi sa sadržajem; privatni objekat nije dostupan pre `CLEAN`. `SafeDocumentScanner` trenutno pretražuje EICAR testni potpis i nema pun antivirusni engine. Ne predstavljati `CLEAN` kao dokaz produkcionog malware skeniranja. Generisani server izveštaji imaju poseban trusted put.

S3 kredencijali i bucket policy su spoljašnja konfiguracija; backend adapter sam ne uspostavlja off-site backup, versioning ili retention politiku bucket-a. [Backup vodič](../operations/BACKUP_RECOVERY.md) opisuje potrebnu koordinaciju baze i objekata.

## Machine i Windows granice

Machine identitet je odvojen od user identiteta. Enrollment kod važi 10 minuta i troši se jednom; Ed25519 private key ostaje na stanici. Jednokratni 60-sekundni challenge daje petominutni station-scoped machine JWT. Revoke se proverava prema bazi. Policy/lease potpisuje **drugi**, backend Ed25519 ključ; code-signing sertifikat je treći, zaseban trust materijal.

Service je instaliran kao **LocalSystem**, Shell kao standardni igrač. DPAPI LocalMachine štiti production identity, a ACL ograničava pristup; development koristi CurrentUser. Named pipe provere razdvajaju korisničke i elevated administratorske operacije. Web OWNER/ADMIN ne daje Windows administrator token.

Potpisani lease ograničava offline rad do `graceEndsAt`, najdalje do `sessionEndsAt`; lokalni sat ne sme produžavati sesiju. AppLocker i zaštićene game putanje čine OS granicu izvršavanja; Client process monitor sam nije dovoljna izolacija. Lokalni administrator je izvan te granice. Videti [Client vodič](../operations/WINDOWS_CLIENT.md) i [rollout proveru](../operations/GAMING_CLIENT_PRODUCTION_ROLLOUT.md).
