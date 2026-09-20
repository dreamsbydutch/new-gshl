---
name: gshl-frontend
description: >-
  Change or review the active GSHL Next.js UI path. Use for routes, components,
  hooks, view models, navigation, accessibility, responsive behavior, or
  frontend architecture failures. Exclude backend-only and operator work.
metadata:
  short-description: Change GSHL frontend code within enforced layers
---

# GSHL frontend

The outcome is a change on the active render/data path, placed in the narrowest
owning layer, with loading and interaction states preserved.

## Establish the path

Read the relevant sections of the
[frontend architecture](../../../docs/architecture/frontend.md) and
[route map](../../../docs/reference/routes.md). Start at the route and use
callers/imports to trace the rendered component, feature hook, main hook,
Convex function, transforms, and types that actually participate. Similar
names are not evidence: before editing, account for every file you intend to
touch as active, compatibility-only, or unreferenced.

Choose ownership before writing code:

| Concern | Owner |
| --- | --- |
| Route composition, metadata, redirects, server guards | `src/app` |
| Rendering and interaction | `src/components/<feature>` |
| Feature orchestration and view models | `src/hooks/features` |
| Stable remote/domain access | `src/hooks/main` |
| Deterministic transforms | `src/lib/utils` |
| Shared frontend contracts | `src/lib/types` |

Reuse the nearest existing primitive, skeleton, hook, transform, and type before
adding another abstraction. If the required data contract does not exist,
invoke the `gshl-convex` workflow for that part of the change.

## Implement the change

Keep client state at the lowest boundary that needs it. Components obtain
navigation, authentication, persisted state, and Convex data through hooks;
pure transforms remain outside React. Clone query results before sorting.

Match the existing feature's spacing and interaction language. For UI changes,
explicitly inspect loading, empty, error, populated, narrow-screen, overflow,
keyboard, and focus behavior; record which states are impossible or out of
scope instead of silently skipping them. Use existing logo-led identification
and compact secondary controls where the feature already establishes them.

## Completion gate

The work is complete when:

- the edited files are proven to be on the active path;
- each concern sits in the owner above and the architecture checker accepts it;
- changed deterministic behavior has a focused test;
- all applicable UI states were inspected; and
- the targeted checks selected from the
  [verification guide](../../../docs/operations/verification.md) pass, with
  skipped checks and pre-existing failures reported.
