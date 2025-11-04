# Utilities (Heavy Lifting)

Guidelines for building, organizing, and using utilities across the codebase.

---

## Purpose

Utilities centralize reusable logic: calculations, transforms, parsing, formatting, validation, ranking, and feature-specific domain rules. They keep hooks thin and components pure.

---

## Principles

- Prefer pure functions (no I/O, no hidden state).
- Keep utilities small, focused, and composable.
- Use descriptive names; avoid abbreviations.
- Favor immutable operations (copy before sorting/filtering/mapping).
- Organize by domain under `src/lib/utils/**`:
  - `core/` for primitives (formatters, parsing, collection helpers)
  - `domain/` for domain rules (contracts, lineup logic)
  - `features/` for feature-level helpers (draft, standings)
  - `stats/` for stat math and aggregations
  - `integrations/` for external service helpers

---

## When to Co-Locate vs Promote

- Co-locate a helper inside a file only when:
  - It is narrow in scope
  - It is not reused elsewhere
  - It simplifies the parent file’s readability
- Otherwise, promote to `src/lib/utils/**` and export via barrel.

---

## Function Design

- Input types should be explicit and reusable (prefer shared types from `@gshl-types`).
- Don’t accept/return overly generic `any`—define meaningful interfaces.
- Validate assumptions at boundaries; throw or return Result-like variants where helpful.
- Avoid catching exceptions without handling; let callers decide how to recover.

---

## Example

```ts
// src/lib/utils/stats/calc-goalie-toi.ts
export function calculateGoalieTimeOnIce(goalsAgainst: number, gaa: number): number | null {
  if (Number.isNaN(goalsAgainst) || Number.isNaN(gaa)) return null;
  if (gaa === 0) return 60; // Full game
  return Math.round((goalsAgainst * 60) / gaa);
}
```

```ts
// src/lib/hooks/features/useGoalieSummary.ts
import { calculateGoalieTimeOnIce } from "@gshl-utils";

export function useGoalieSummary(/* options */) {
  // ...fetch data
  const toi = calculateGoalieTimeOnIce(ga, gaa);
  // ...compose result
}
```

---

## Testing

- Utilities should have direct unit tests with realistic inputs.
- Prefer deterministic functions; inject dependencies if unavoidable.

---

## Performance

- For heavy transforms, measure and memoize at the hook layer.
- Batch or chunk large updates; avoid tight loops with async.


