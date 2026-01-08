# Copilot instructions (GSHL - Next.js app)

## Scope

- This document applies to the Next.js/TRPC codebase under `src/**`.
- Treat `apps-script/**` as a separate project with separate instructions.

## Big picture (read path)

- Next.js 15 App Router UI lives in `src/app/**` and renders feature components from `src/components/**`.
- Google Sheets is the “database”. The Next.js/TRPC side is **read-optimized** and primarily reads via `src/lib/sheets/reader/fast-reader.ts` (`fastSheetsReader`).

## UI conventions (important in this repo)

- Feature components are **prop-driven**: no remote fetching or side effects inside `src/components/**` feature folders.
- Use the feature anatomy described in `README.md`: `main.tsx` orchestrates; derivation in `hooks/`; pure presentational pieces in `components/`; pure helpers/types in `utils/`.
- Use the repo’s “readiness” pattern: hooks compute `ready` and `main.tsx` shows a skeleton until ready.

## Imports & aliases

- Prefer TypeScript path aliases from `tsconfig.json`; avoid deep relative imports (see `docs/reference/IMPORT_ALIASES.md`).
- When importing a feature component, follow the established convention of importing its `main` entry (example: `@gshl-components/team/TeamSchedule/main`).

## TRPC patterns

- Routers live in `src/server/api/routers/*` and must be registered in `src/server/api/root.ts`.
- Procedures typically use `publicProcedure` from `src/server/api/trpc.ts` (includes timing logs).
- Client: `src/trpc/react.tsx` exports `clientApi` + `TRPCReactProvider` (SuperJSON, http batch stream, query persistence).
- Server/RSC: `src/trpc/server-exports.ts` exports `serverApi` + `HydrateClient` for prefetch/hydration.

## Sheets access patterns (server)

- Prefer bulk reads via the snapshot endpoint `clientApi.snapshot.get` implemented in `src/server/api/routers/snapshot.ts`.
- For small query-style access on the server, use the helpers in `src/server/api/sheets-store.ts` (`getMany`, `getFirst`, `getCount`) instead of ad-hoc filtering.
- Many write paths are intentionally blocked in “read-optimized mode” (see `src/server/api/utils.ts`).

## Common workflows

- Dev server: `npm run dev`
- Quality gate: `npm run check` (lint + typecheck)
- Format: `npm run format:write`

## Environment

- Env vars are validated by `src/env.js` (T3 Env). The server expects `USE_GOOGLE_SHEETS` and `GOOGLE_SERVICE_ACCOUNT_KEY` (or `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`).
- Use `SKIP_ENV_VALIDATION=1` only when you intentionally need to bypass validation (e.g., certain build contexts).
