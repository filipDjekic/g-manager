# G-Manager frontend

React 19, TypeScript i Vite klijent za G-Manager.

## Preduslovi

- Node.js 22 ili noviji;
- npm;
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
npm run build
```

Sve projektne backend i frontend provere mogu se pokrenuti iz korena:

```powershell
.\scripts\verify.cmd
```

ili:

```bash
./scripts/verify.sh
```
