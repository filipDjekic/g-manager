# Stage 25 — Feature flags i multi-tenancy readiness

## Stop/go odluka

**NO-GO za produkcijsku multi-tenant migraciju.** G-Manager je trenutno single-business sistem, a multi-organization je samo POST-MVP stavka. Ne postoji odobren model organizacije, članstva, tenant administratora, trusted identity claim-a, onboarding/offboarding procesa niti podatak kojim bi postojeći redovi bili bezbedno razvrstani. Dodavanje `tenant_id` sada bi napravilo polu-tenant sistem i povećalo rizik curenja.

U skladu sa acceptance kriterijumom Stage završava ADR-23 discovery/prototype rezultatom, bez tenant tabela, header switch-a ili spekulativnog backfill-a. `TenantIsolationPrototypeTest` potvrđuje budući ugovor: tenant dolazi samo iz pouzdanog identity izvora, proizvoljan klijentski header se ignoriše, a background posao bez konteksta mora fail-closed.

Ako zahtev bude odobren, preporuka je shared schema sa obaveznim `tenant_id`: tenant tabela, nullable FK/compound indeksi, idempotentni initial-tenant backfill, orphan/cross-tenant canary, izolaciona matrica za repository/API/search/export/SSE/document/job/audit, pa tek onda NOT NULL i tenant-aware unique constraints. Schema-per-tenant ostaje van obima bez regulatornog razloga. Frontend tenant switch tada zahteva eksplicitno ovlašćenje i reset React Query, PWA cache-a, SSE veze i draftova. Tenant ID nije high-cardinality metric label.

## Typed feature flags

Produkcijski deo uvodi enum definicije sa typed defaultom, ownerom i review datumom: `REPORTS`, `WORKFLOWS`, `PWA_OFFLINE` i default-off `AI_ASSISTANT`. Deployment defaulti su:

- `FEATURE_REPORTS_ENABLED=true`
- `FEATURE_WORKFLOWS_ENABLED=true`
- `FEATURE_PWA_OFFLINE_ENABLED=true`
- `FEATURE_AI_ASSISTANT_ENABLED=false`

Runtime override sadrži enabled, rollout procenat, opciono vreme isteka, obavezan razlog, actor i optimistic version. Istekao override pada na typed/environment default. Stabilni hash `(userId, flag)` određuje rollout bucket. OWNER i ADMIN imaju `FEATURE_FLAG_MANAGE`; svaka promena piše `FEATURE_FLAG_UPDATED` audit i konflikt verzije vraća 409.

Backend filter sprovodi `REPORTS` i `WORKFLOWS`, pa frontend navigacija nije sigurnosna granica. Disabled endpoint vraća stabilan 404 i ne menja postojeće permission provere.

## API i frontend

- `GET /api/v1/features/bootstrap` — efektivni flagovi prijavljenog korisnika.
- `GET /api/v1/features` — definicije i override metadata za upravljanje.
- `PATCH /api/v1/features/{flag}` — auditovana promena rollout-a.
- `/features` — administratorska forma sa owner/review informacijama i obaveznim razlogom.

Bootstrap se učitava posle login i refresh toka. Typed frontend fallback ostavlja eksperimentalni AI isključen ako bootstrap nije dostupan. Logout resetuje flag stanje. Isključena report/workflow ruta ima stabilnu unavailable stranicu.

## Runbook

Rollout početi malim procentom, pregledati poslovne/error metrike, pa povećavati. Hitni rollback je `enabled=false` ili rollout 0 uz razlog. Override treba da ima rok; environment default se menja samo verzionisanim deploymentom. Flag nije autorizacija i permission provera se nikad ne uklanja. Tenant GO odluka zahteva zaseban odobren ADR, kopiju produkcione baze i višedeploymentnu migraciju; V22 namerno ne dodaje tenant kolone.
