# Franchise contract module

Source: architecture-review candidate 1, selected for implementation on 2026-09-20.

## Scope

Deepen the franchise contract module within the existing architecture:

- Main hooks own Convex contract and NHL salary reads and contract creation.
- A feature hook owns dependent reads, memoization, and loading/readiness for
  the existing `useContractData` callers.
- Runtime-pure lib functions own franchise contract projections: owner-scoped
  deduplication, current contracts, buyouts, historical value, cap window, and
  current/next-season draft-pick groups. Reuse existing contract utilities and
  consolidate duplicated date/year rules.
- Preserve current result shapes and behavior for locker-room and draft views,
  including missing salary data, missing players, expiry deadlines, and team
  versus franchise references. Inputs must not be mutated.
- Correct the identified first-season edge case: the next draft season must
  also be included when the current season is first in the ordered collection.
- Remove unused generic map/select/getContracts/selectDeps machinery and the
  `useAllContracts` alias after checking callers; retain used query options.
- Keep server authorization, transactions, persisted data, and remote query
  semantics unchanged. No deployment or production-data operations.

## Task graph

1. **Contract projections** (ready): extract deterministic projections, shared
   year/date rules and focused behavioral tests into lib. No hook edits.
2. **Hook ownership** (ready; final verification depends on 1): simplify the
   main contract hook, move `useContractData` to features, migrate exports and
   callers, and delegate calculations to the projection module from task 1.
3. **Integration and review** (blocked by 1 and 2): merge both changes, verify
   projections and dependent-query behavior, run focused lint, architecture
   checks and type checking, and review standards and spec separately.

## Acceptance checks

- Focused tests cover current/buyout/expired output, duplicate contracts,
  missing salary/player records, expiry deadline, first and missing seasons,
  franchise/team pick references, and immutable inputs.
- Dependent reads remain disabled without owner/player scope; readiness still
  waits for contract, player, and salary reads and a selected team/season.
- No raw Convex access in the new feature hook; no React access in projections.
- Existing contract/table/salary tests pass, changed lintable files pass lint,
  architecture checks pass, and type checking has no new failures.

No corresponding issue or ticket numbers existed at implementation start;
this document is the spec and task graph for the pull request.
