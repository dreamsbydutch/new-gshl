# Guidance for AI helpers

## Architecture snapshot

- Next.js 15 App Router + React 18 powers the UI; server data flows through tRPC 11 defined in `src/server/api/routers/*`.
- Google Sheets is the source of truth via the `optimizedSheetsAdapter` in `src/lib/sheets`; every router wraps that adapter.
- Client hooks under `src/lib/hooks` use `clientApi` from `src/trpc/react` and compose multiple queries into view models (see `useTeam.ts`).
- Query caching is handled by `createQueryClient` (`src/trpc/query-client.ts`) with a 30s stale window and SuperJSON hydration.

## UI conventions

- Feature folders in `src/components/*` follow `main.tsx` + `hooks/` + `components/` + `utils/`; stay prop-driven and keep fetching out of features.
- Path aliases in `tsconfig.json` map `@gshl-components/Feature` to the feature `main.tsx`, `@gshl-hooks` to the shared hook barrel, etc.—use them instead of long relative paths.
- Always route derived data through the colocated hook (e.g. `ContractTable/main.tsx` delegates to `hooks/useContractTableData.ts`).
- Skeletons live in `src/components/skeletons` and should gate render until `ready` flags from hooks resolve.
- All exported components/helpers expect full JSDoc blocks as documented in `README.md`; copy the style from `ContractTable/main.tsx`.

## State and data patterns

- Use the persisted Zustand store in `src/lib/cache/store.ts` (`useNavStore`) for cross-page filters like season/owner, then pass that state into hooks.
- Season-aware views should call `useSeasonState` to obtain `selectedSeason`, fallbacks, and setter logic instead of re-deriving IDs.
- When adding mutations, expose them through tRPC procedures and invalidate caches with `api.useUtils()` as seen in `src/app/leagueoffice/page.tsx`.
- Date fields often arrive as strings from Sheets; normalize in hooks or utils before passing to components (see filtering in `lockerroom/page.tsx`).

## Workflows & automation

- Install deps with npm 10 (per `package.json`); primary commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run check`, `npm run build`.
- Sheets maintenance scripts live under `src/scripts/migration.ts` (`npm run sheets:*`) and rely on env validated in `src/env.js`.
- Apps Script artifacts are in `src/server/apps-script`; deploy via the provided npm scripts or the VS Code task "Deploy Apps Script".
- Environment flags like `USE_GOOGLE_SHEETS` and service account secrets must be present before build or server calls will fail.

## Adding or modifying features

- To surface new data, add or extend a router in `src/server/api/routers`, then export a hook in `src/lib/hooks` that composes the query result.
- Keep transformations pure and immutable; reuse helpers from `src/lib/utils` (e.g. season resolution, formatting) instead of ad-hoc logic.
- Demo pages under `src/app/*` are client components—wrap new widgets with `"use client"` and feed them pre-fetched props from hooks.
- Use `@gshl-ui` primitives and Tailwind utility classes for styling; respect existing `cn` helper merges for conditional classes.
- Before finishing a PR, run lint + typecheck locally and confirm the relevant TRPC queries still hydrate on the client (watch for schema drift from Sheets).
