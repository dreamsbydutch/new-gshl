# new-gshl Frontend Architecture & Component Structure Guide

This document defines the conventions we are following for React / Next.js feature components in this repo. Treat it as the single source of truth when adding or refactoring UI code.

## Core Principles

1. Data enters a feature component ONLY via props (or context providers composed higher up). No remote fetching, global store reads, or side‑effects inside feature component folders.
2. Pure presentation in `main.tsx`. Derive / shape data in colocated hooks; render in the main component with minimal logic.
3. Explicit separation of concerns:
   - Fetching: global shared hooks in `src/lib/hooks` (TRPC, sheets, etc.)
   - Derivation / memoization specific to a feature: local `hooks/` inside that feature folder
   - Presentation: `components/` (dumb / stateless) + `main.tsx` (orchestrator)
   - Reusable helpers: `utils/` (pure functions + types + constants)
4. All non-trivial functions / exported symbols documented with JSDoc for IntelliSense.
5. Deterministic, prop-driven rendering: skeletons or loading placeholders appear ONLY when required prop sets are incomplete.
6. Zero hidden mutation: treat inputs as immutable; clone before sort/modify.
7. Lean public API: feature `index.ts` (if added) should export only what consumers need.

## Standard Feature Folder Anatomy

```
src/components/FeatureName/
  main.tsx            # Entry point React component (orchestrator, no fetching)
  components/         # Pure presentational subcomponents (PlayerRow, Header, etc.)
  hooks/              # Feature‑specific derivation hooks (e.g. useFeatureData)
  utils/              # Pure helpers, constants, type re-exports
    types.ts          # Local prop interfaces (public surface for this feature)
    utils.ts          # Stateless helper functions
    constants.ts      # Feature-scoped constants (exported via utils/index)
    index.ts          # Barrel (re-export types/utils/constants)
  ... (NO network code, NO global store interactions)
```

Shared skeleton loaders live under `src/components/skeletons/` and are imported (aliased) by features.

### Example: ContractTable

Key files:

- `main.tsx`: Accepts `currentSeason`, `currentTeam`, `contracts`, `players`, `nhlTeams`; delegates shaping to `useContractTableData` and renders table.
- `hooks/useContractTableData.ts`: Sorts contracts, calculates future cap space, exposes readiness flag.
- `components/`: `PlayerContractRow`, `TableHeader`, `CapSpaceRow` – all pure & prop-driven.
- `utils/`: `getExpiryStatusClass`, seasonal label helpers, cap constants.

## Data Flow Rules

| Layer                                      | Responsibility                                                                | Permitted Operations                          |
| ------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------- |
| lib hooks (`src/lib/hooks`)                | Fetch raw domain data (TRPC / Sheets), convert / normalize primitives (dates) | Network I/O, date conversion, minimal mapping |
| feature hooks (`components/Feature/hooks`) | Derive UI-specific view models (sorting, aggregations, readiness flags)       | Pure calculations, `useMemo`, no fetching     |
| feature main component                     | Wire props + derived data -> presentational structure                         | Conditional rendering, simple branching       |
| subcomponents                              | Stateless rendering of provided data                                          | Formatting, minimal conditional classnames    |
| utils                                      | Pure functions, constants, lightweight formatting                             | No React / side-effects                       |

### Readiness Pattern

If a feature needs multiple prop arrays:

1. Accept them as optional in prop types (`foo?: Entity[]`).
2. Hook computes a boolean `ready` when all required sets are non-empty.
3. `main.tsx` shows skeleton until `ready === true`.

## Hooks Guidelines

- Naming: `useFeatureThing` (domain first, camera second). Example: `useContractTableData`.
- Inputs: mirror the props the feature receives; accept them as optional when supporting skeleton states.
- Return an object keyed by clear nouns: `{ sortedContracts, capSpaceByYear, ready }`.
- Use `useMemo` for derived arrays / maps to avoid unnecessary recalculations.
- Never mutate input arrays; spread / map first.

## Presentational Component Guidelines

- Stateless, no internal data requests.
- Accept pre-shaped primitives or view-model objects.
- Use concise class logic; offload complex styling derivations to helpers.
- Always include an explicit `key` when rendering lists.
- Keep width / layout concerns local (Tailwind) unless truly global.

## Utils & Constants

- Co-locate feature-specific constants in `constants.ts` (e.g. cap ceiling, calendar cutoffs).
- Export via `utils/index.ts` so consumers can `import { CAP_CEILING } from '@gshl-components/FeatureName'` if needed.
- Avoid importing from one feature's utils into another feature directly; promote to a shared location (`src/lib/utils`) if cross-feature reuse emerges.

## Types

- Local prop & view model types live in `utils/types.ts` and are re-exported through the feature barrel.
- Domain (database) types remain in `src/lib/types`.
- Prefer explicit prop interfaces over inline type literals for reusability & documentation.

## Documentation / JSDoc

Every exported function / component needs a leading JSDoc block describing:

- Purpose sentence
- Key responsibilities (bulleted or brief list) if non-trivial
- Important param annotations (`@param`), return shape (`@returns`)
- Any assumptions / invariants

## Styling & Layout Conventions

- TailwindCSS utility-first approach.
- Use `whitespace-nowrap` for tabular numeric data to prevent line breaks.
- Sticky / frozen columns: apply `sticky left-* bg-... z-*` to required leading cells.
- Horizontal overflow handled by a wrapping div with `overflow-x-auto` and optional custom scrollbar hiding.

## Do & Don’t

| Do                                           | Don’t                                         |
| -------------------------------------------- | --------------------------------------------- |
| Derive everything possible in a hook         | Fetch data inside `components/Feature`        |
| Keep `main.tsx` thin and focused on layout   | Sort / aggregate ad hoc inside JSX map blocks |
| Document exported symbols                    | Leave ambiguous logic inline without context  |
| Promote widely reused helpers to shared libs | Cross-import internal feature utils directly  |
| Use readonly data patterns                   | Mutate props or derived arrays in place       |

## Adding a New Feature Component Checklist

1. Create folder: `src/components/NewFeature/`.
2. Scaffold subfolders: `components/`, `hooks/`, `utils/` (+ `types.ts`, `utils.ts`, `constants.ts`, `index.ts`).
3. Define prop interface(s) in `types.ts` (make optional if skeleton state desired).
4. Write derivation hook returning `{ ready, ... }`.
5. Implement `main.tsx` with skeleton fallback.
6. Add presentational subcomponents – each minimal, prop-driven.
7. Add/adjust constants & helpers in `utils`.
8. Add JSDoc to every export.
9. Verify no fetching / global store consumption inside feature folder.
10. Add usage in a page or parent component passing fetched data as props.

## Example Minimal Hook Template

```ts
// hooks/useNewFeatureData.ts
import { useMemo } from "react";
import type { NewFeatureProps } from "../utils";

export function useNewFeatureData(props: NewFeatureProps) {
  const ready = Boolean(/* required props completeness check */);
  const derived = useMemo(
    () => (ready ? /* transform */ [] : []),
    [ready /* deps */],
  );
  return { ready, derived };
}
```

## Example Main Component Skeleton Pattern

```tsx
// main.tsx
import { FeatureSkeleton } from "@gshl-skeletons";
import { useNewFeatureData } from "./hooks";
import type { NewFeatureProps } from "./utils";

export function NewFeature(props: NewFeatureProps) {
  const { ready, derived } = useNewFeatureData(props);
  if (!ready) return <FeatureSkeleton />;
  return <div>{/* render derived */}</div>;
}
```

## When to Refactor Into Shared Lib

Promote a utility / hook out of a feature when BOTH:

- It’s imported (or needed) by ≥2 distinct feature folders
- Its logic is stable and domain-oriented (not UI-specific)

Destination candidates:

- `src/lib/hooks` for domain / fetching hooks
- `src/lib/utils` for domain helpers

## Future Enhancements (Optional)

- Storybook for isolated component development
- Testing strategy (React Testing Library + Vitest/Jest) for derivation hooks
- Lint rule to forbid imports of `@gshl-hooks` or TRPC directly inside feature folders

---

## Documentation

Comprehensive documentation is available in the `docs/` folder:

- **[docs/DATA_SYSTEMS.md](./docs/DATA_SYSTEMS.md)** - Complete guide to data systems:

  - PlayerDay system with upsert, partitioning, and validation
  - Stat aggregation pipeline (Days → Weeks → Splits → Totals)
  - Season type splitting (Regular Season, Playoffs, Losers Tournament)
  - Google Sheets partitioning across multiple workbooks

- **[docs/RANKING.md](./docs/RANKING.md)** - Player performance ranking system:

  - Position-specific ranking algorithm (0-100 scale)
  - Training and testing the ranking model
  - API reference and integration examples
  - Performance considerations and troubleshooting

- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Vercel deployment guide:
  - Quick start deployment steps
  - Cron job configuration for automated scraping
  - Security, monitoring, and troubleshooting
  - Local development setup

---

Questions or improvements? Open a PR updating this README so the guide stays living and authoritative.
