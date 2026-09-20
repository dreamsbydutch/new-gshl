# Hook read domains and draft projections

Implements architecture-review Candidates 3–6, selected on 2026-09-20.
Builds on Candidate 2, PR #14. No original issue/ticket identifiers or separate
candidate specifications were found; this document records the implementation
scope inferred from the selected candidates and active callers.

## Requirements

### Candidate 3: Share the draft-player catalog projection

Concentrate repeated draft eligibility, already-drafted exclusion, NHL logo and
latest-stat enrichment in a deterministic utility under lib/utils. Feature hooks
fetch through main hooks and compose that projection. Preserve each caller's
sorting, filtering, pagination, mock-projection limits, and completed-pick rules.
Keep source arrays immutable. Do not change rankings, draft transactions, or
contract eligibility rules.

### Candidate 4: Make read results honest and domain-specific

Replace the team/franchise/NHL/stat union interface with domain-specific results
so callers do not assert the requested result type. Remove fabricated read
error/refetch capabilities from the affected read interfaces and their consumers.
Convex query failures continue to reach the existing error boundaries; genuine
in-band errors (such as optional subscriptions) and write errors retain their
behavior. Skipped queries must not claim to load; empty arrays do not prove
hydration. Preserve query filters, scopes and loading/empty UI behavior.

### Candidate 5: Restore main-hook ownership of Convex access

Move the mock draft preview, owner rankings, and UFA transports out of feature
hooks into named domain main hooks. Keep feature transformations in feature
hooks/utilities and retain public consumer behavior. UFA modes still subscribe
only to their intended catalog. Writes retain Candidate 2's typed lifecycle.
Add a focused architecture guard and fixtures preventing feature hooks from
importing Convex runtime access or generated API references directly.

### Candidate 6: Concentrate draft team and season selection

Centralize draft-season resolution and viewer/team selection shared by draft
layout and feature hooks. Move toggle filtering, sorting and selection out of
rendering components. Preserve route/owner navigation semantics, explicit
overrides, signed-out/loading behavior and the public TV's non-mutating season
selection. Keep roster board's latest-active-franchise selection distinct from
season-specific teams.

## Task graph

1. **Read ownership** (ready): Candidate 5 main adapters and architecture guard.
2. **Honest reads** (ready): Candidate 4 domain interfaces and consumer migration.
3. **Draft projection and selection** (ready; integration depends on 1/2):
   Candidates 3 and 6 share draft files and are implemented together.
4. **Integration and review** (depends on 1/2/3): resolve overlapping edits,
   focused tests/type checks, independent Standards and Spec reviews, ready PR.

Each implementer uses an isolated worktree; a merger integrates into one PR.
Generated files, server authorization, production data and deployments are out
of scope. Existing local generated-file edits must remain untouched.

## Acceptance and baseline

- Behavioral tests cover catalog membership/enrichment and immutability, draft
  selection edge cases, skipped/loading/empty reads, UFA mode scoping, and query
  ownership. Compile-time fixtures prove domain-specific read results.
- Focused ESLint, affected tests, architecture and diff checks pass.
- Full type checking adds no failures beyond the baseline on Candidate 2 head
  `eddff7d09ea1a431b6df386db8c8927c7e87cd55`: `convex/draft.test.ts(482,16)`
  TS18046 (`result` is unknown).
- Preserve existing UI and behavior; no visual redesign or additional data reads
  solely to support abstractions.
