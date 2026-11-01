# G-Manager frontend

React 19/TypeScript/Vite SPA sa React Router-om, TanStack Query-jem, Zustand store-ovima i API adapterima u `src/api`. Rute i capability guards su u `src/App.tsx`. Backend ostaje autoritativan za dozvole i poslovna pravila.

[Glavni Quick Start](../../README.md#quick-start-backend-i-frontend-na-hostu) opisuje zajedničko pokretanje. Za frontend su potrebni Node prema `engines` i npm prema `packageManager` u [package.json](package.json); CI koristi Node 22.23.3/npm 11.19.1.

Iz ovog direktorijuma, nakon starta backend-a:

```powershell
npm ci
npm run dev
```

`.env` je opcion, sa [primerom](.env.example) `VITE_API_URL=/api/v1`. Vite prosleđuje `/api` i `/media` na localhost:8080. `VITE_*` vrednosti su javne i ulaze u bundle pri build-u; ne stavljati tajne. Docker izdanje služi Nginx i nije Vite development server.

- [Lokalni razvoj](../../docs/development/LOCAL_SETUP.md)
- [Konfiguracija](../../docs/reference/CONFIGURATION.md)
- [API i authorization](../../docs/reference/API.md)
- [Testiranje, lint, typecheck, build i E2E](../../docs/development/TESTING.md)
- [Arhitektura i PWA ograničenja](../../docs/architecture/OVERVIEW.md)

Komande i testovi nisu izvršavani tokom reorganizacije dokumentacije.
