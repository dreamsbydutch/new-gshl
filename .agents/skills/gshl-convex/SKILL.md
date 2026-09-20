---
name: gshl-convex
description: >-
  Change or review the GSHL Convex data contract and backend behavior. Use for
  schema, queries, mutations, actions, authorization, privacy, indexes, jobs,
  crons, generated APIs, or browser-facing Convex access. Exclude UI-only and
  Apps Script-only work.
metadata:
  short-description: Change GSHL Convex schema, APIs, auth, or jobs safely
---

# GSHL Convex backend

The outcome is a bounded server-side contract whose data ownership,
authorization, and read/write cost are explicit.

## Establish the contract

Read the relevant section of the
[Convex guide](../../../docs/architecture/convex.md). Read the
[data model](../../../docs/architecture/data-model.md) when tables,
relationships, identifiers, or timestamps change, and the
[authentication guide](../../../docs/architecture/authentication.md) when a
caller can observe or mutate protected data.

Trace every affected caller before choosing a surface:

- Browser-facing projections and ordinary league reads: `convex/frontend.ts`.
- Atomic invariants and transactions: the focused owning domain module.
- Operator imports/migrations under server-secret authorization: `convex/data.ts`.
- Scheduled work: the owning internal function plus `jobRunner.ts`/`crons.ts`.

For a managed job or external worker, also read the
[managed-jobs guide](../../../docs/operations/managed-jobs.md). State whether
the path is authoritative, parity-stage, or source-capture-only; do not promote
it to an apply-capable replacement without demonstrated parity and idempotency.

Before implementation, write down the input validator, output shape, caller,
authorization rule, query bound/index, and transaction boundary. A schema/API
change is not ready to edit until each item is known.

## Protect the boundaries

Use Convex `_id` as identity and keep imported IDs in `legacyId`. Preserve the
person/owner, franchise, and season-team distinctions. Use the repository
timestamp helpers and keep day-stat dates as calendar keys.

Enforce authorization inside every protected server function and filter private
fields before returning. Treat client role checks as presentation only. Imports
from `src/lib` must remain pure and Convex-runtime compatible.

Bound production reads with a suitable index and scope before collection. If
the requested access pattern cannot be bounded, stop and redesign the query
instead of normalizing an unbounded scan.

Calling a server-secret function, clearing/splitting data, deploying, or
enabling a schedule is a data operation. Invoke `gshl-data-operations` and
obtain its target, authorization, dry-run, and backup gates before execution.
Code edits alone grant no runtime-write authority.

## Completion gate

The work is complete when every affected caller matches the new contract,
authorization and privacy have been reviewed at the server boundary, reads are
bounded, and focused tests cover the domain behavior. Regenerate bindings with
`npx convex codegen` after schema or exported-surface changes; never edit
`convex/_generated` directly. Select all remaining checks from the
[verification guide](../../../docs/operations/verification.md), including
direct lint for changed nested `convex/lib` files, and report any runtime path
that lacks integration coverage.
