# Typed write lifecycle

Source: architecture-review candidate 2, selected on 2026-09-20.
This branch builds on the merged franchise-contract-module PR.

## Scope and behavior

- Share mutation/action execution state in one React hook. Main hooks remain
  the Convex adapters; only reusable pure error normalization belongs in lib.
- Preserve generated Convex argument and return types through `mutateAsync`
  and typed mutation `onSuccess` callbacks. Invalid arguments must fail type
  checking. Keep existing mutation methods (`mutate`, `mutateAsync`,
  `isPending`, `error`) and the existing action methods (`mutateAsync`,
  `isPending`, `error`).
- `isPending` remains true while any call on that hook instance is unsettled,
  regardless of settlement order. A newly started call clears displayed error.
  The most recently started call owns displayed error; older completions must
  not overwrite its state. Each call still returns or rejects independently.
- Normalize non-Error rejections to Error and rethrow from `mutateAsync`.
  Existing Error objects retain their identity. Each callback-style invocation
  runs its own success or error callback and its settled callback once.
  Keep existing callback exception behavior unless a demonstrated issue
  requires an explicitly documented refinement; do not add retries, caching,
  cancellation, optimistic updates or new notification behavior.
- Reconcile existing caller types exposed by stricter inference at owning main
  hooks/type declarations, rather than weakening the shared write interface or
  scattering Convex ID assertions through UI. Server authorization, transaction
  behavior, and payload values remain unchanged.
- Hooks own React state. Shared types remain type-only. No generated-file edits,
  deployment, or production writes.

## Task graph

1. **Shared execution** (ready): implement typed adapters, lifecycle state, and
   pure error normalization; identify caller type errors for task 3.
2. **Behavior and type tests** (ready, verification depends on 1): exercise real
   React state and Convex adapter calls with deferred promises and local mocks;
   add compile-time tests for valid/invalid arguments and inferred returns.
3. **Caller integration** (blocked by 1): preserve caller payloads while fixing
   newly exposed type errors at domain hook seams. Run focused verification.
4. **Review and handoff** (blocked by 1, 2, 3): standards/spec review, fix issues,
   verify, publish and mark the PR ready.

## Acceptance checks

- Real hook tests cover success, Error/non-Error rejection, retry after failure,
  concurrent writes settling in both orders, latest-call error ownership,
  callbacks, and both Convex mutations and actions without live network access.
- Type tests cover generated mutation and action references, typed success
  callbacks, rejected incorrect arguments, and result types.
- Focused ESLint, type checking, architecture checks and diff checks pass.
- Tests use a React-18-compatible renderer as a development-only dependency.

No corresponding open spec issue or ticket numbers were found. This document
is the PR's specification and task graph.
