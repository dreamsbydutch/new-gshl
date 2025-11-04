# Types & Interfaces Policy

Where types live, how they’re structured, and when to promote them.

---

## Location

- Default home for shared contracts: `src/lib/types/**`.
- Organize by domain (e.g., `app.ts`, `database.ts`, `enums.ts`, `yahooSports.ts`).
- Export via `src/lib/types/index.ts` for clean imports with `@gshl-types`.

---

## Promotion Rules

Promote a type/interface/enum to `src/lib/types` when:

- It is used in more than one module or feature, or is likely to be.
- It models a domain entity (Players, Teams, Contracts, Weeks, Matchups).
- It is part of the API surface (TRPC inputs/outputs, adapter payloads).

Keep a type inline within a file when:

- It is narrow in scope and only relevant to a single function/module.
- It exists to improve local readability only (e.g., a tiny helper type).

---

## Style

- Use explicit, descriptive names (avoid abbreviations).
- Prefer interfaces for object shapes that may be extended, types for unions.
- Enums for finite sets consumed broadly (e.g., `RosterPosition`, `SeasonType`).
- Avoid `any`; favor exact fields or well-typed records/maps.

---

## Imports

- Import shared types via `@gshl-types`.
- Re-export from folder barrels for ergonomic imports.

---

## Example

```ts
// src/lib/types/nav.ts
export interface NavSelection {
  seasonId: string;
  teamId?: string;
}
```

```ts
// usage
import type { NavSelection } from "@gshl-types";
```


