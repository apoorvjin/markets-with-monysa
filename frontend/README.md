# Monysa Web Frontend

pnpm monorepo for the web client. Shares the Express API at `server/` with the
Flutter app — same endpoints, same response shapes.

```
packages/
  contracts/    zod schemas + types for every API response (shared source of truth)
  api-client/   typed fetch layer — every method validates with its contract schema
  ui/           design tokens ported from moby/lib/core/theme/app_palette.dart + primitives
  charts/       lightweight-charts candlesticks, canvas sparkline, squarified canvas treemap
apps/
  web/          Vite + React 19 SPA — TanStack Router/Query, cmdk command palette
```

## Run

```bash
# from frontend/  (requires pnpm 9 — `corepack prepare pnpm@9.15.9 --activate` on Node 20)
pnpm install
pnpm dev          # http://localhost:5173 — talks to http://localhost:5001 in dev
pnpm build        # typecheck + production bundle (static files in apps/web/dist)
```

Start the API first (`npm run server:dev` from the repo root). Port is always
5001 (macOS AirPlay owns 5000).

## Environment

| var | default | purpose |
|-----|---------|---------|
| `VITE_API_BASE_URL` | `http://localhost:5001` in dev, `https://monysa-api.fly.dev` in prod builds | API origin |

## Production CORS

The server only grants CORS to localhost in dev. When deploying the web app,
set `ALLOWED_ORIGINS=https://your-web-domain` on the API (comma-separated list,
already supported by `server/index.ts`).

## Conventions

- **Response shape changes**: update `packages/contracts` first — the web build
  fails at compile time instead of silently mis-parsing (the Dart pitfalls in
  CLAUDE.md can't happen here).
- **Caching**: TanStack Query `staleTime` mirrors the server route TTLs;
  `persistQueryClient` (localStorage, `buster: "v1"`) replicates the mobile
  DiskCache hydrate-stale-then-refresh pattern. Bump the buster when a
  persisted shape changes.
- **Strategy params**: always send `serverParam` (`"1"/"2"/"3"`) to the API,
  never the `S1/S2/S3` label — use the `STRATEGIES` constant from contracts.
- **Theme**: tokens in `packages/ui/src/tokens.css` are a 1:1 port of
  `AppPalette` (dark + light). Use the CSS variables, never literal colors.
- Plan enforcement is intentionally absent on web for now — all features open.
