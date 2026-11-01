# G-Manager frontend

React 19, TypeScript i Vite klijent za G-Manager.

## Preduslovi

- Node.js 22.13+ ili 24+ (Docker i CI koriste 22.23.3);
- npm 11.19.1 (`npm install --global npm@11.19.1`), usklađen sa Docker-om i CI-jem;
- pokrenut G-Manager backend na `http://localhost:8080`.

## Lokalno pokretanje

PowerShell:

```powershell
cd frontend/g-manager
npm ci
npm run dev
```

Bash:

```bash
cd frontend/g-manager
npm ci
npm run dev
```

Aplikacija je dostupna na `http://localhost:5173`. Development server
prosleđuje `/api` i `/media` zahteve backendu.

`VITE_API_URL` nije obavezan za standardni lokalni razvoj. Ako frontend pristupa
backendu na drugom origin-u, kopirati
`frontend/g-manager/.env.example` u `frontend/g-manager/.env` i podesiti pun
API URL. Frontend `.env` ne sme sadržati backend tajne kao što je `JWT_SECRET`.

## Provere

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build:budget
npm run sbom
npm audit
npm run test:e2e
npm run test:e2e:pwa
```

Sve projektne backend i frontend provere mogu se pokrenuti iz korena:

```powershell
.\scripts\verify.cmd
```

ili:

```bash
./scripts/verify.sh
```
