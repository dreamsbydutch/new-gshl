---
name: gshl-frontend
description: >-
  Implement or review GSHL Next.js frontend work under src/. Use when a task
  mentions a page, route, layout, component, UI, Tailwind, skeleton, hook, view
  model, navigation, client component, frontend type, import alias, responsive
  behavior, accessibility, or an architecture-check violation. Do not use for a
  Convex-only or operator-script-only change.
metadata:
  short-description: Change GSHL frontend code within enforced layers
---

# GSHL frontend

Read [AGENTS.md](../../../AGENTS.md) before editing. Use the
[frontend architecture](../../../docs/architecture/frontend.md) and
[route map](../../../docs/reference/routes.md) to identify the active path.

## Trace before placing code

Start at the active `src/app` route and follow its feature component, feature
hook, main hook, Convex function, pure transforms, and shared types. Search for
callers before changing similarly named files; legacy unreferenced components
remain in the tree.

Place work at the narrowest layer that owns it:

- Route composition, metadata, redirects, and server guards: `src/app`.
- Rendering and interaction: `src/components/<feature>`.
- Multi-hook orchestration and view models: `src/hooks/features`.
- Stable remote/domain access: `src/hooks/main`.
- Deterministic transforms: `src/lib/utils/{core,domain,features}`.
- Shared type contracts: `src/lib/types`.
- Domain-agnostic primitives and loading states: existing `components/ui` and
  `components/skeletons` files.

## Preserve the enforced boundaries

- Keep route files thin and use Server Components until client behavior is
  required.
- Components use hooks for Convex, navigation, auth, and persisted state. Do not
  import those integration modules directly.
- Hooks never import components. Utilities stay framework-free. Types stay
  runtime-free.
- Use PascalCase named component exports and `use`-prefixed hook filenames.
- Clone props and query results before sorting or mutation.
- Preserve loading, empty, error, overflow, keyboard, and mobile states.
- Use existing Tailwind tokens and primitives; do not introduce a styling or
  state-management alternative for a local change.
- Use existing league, conference, GSHL team, and NHL team logos for color and
  compact identification before adding colored surfaces or repeated names.
  Preserve an accessible name when a logo replaces visible text.
- Keep secondary and tertiary navigation low-profile. Use compact 36px rows and
  controls; reserve the larger mobile target treatment for primary navigation
  and consequential actions. Keep focus states visible at every size.

## Verify

Run `npm run check:architecture`, the smallest relevant `tsx --test` files,
and the affected root lint/type-check. Use the
[verification guide](../../../docs/operations/verification.md) because
`npm run check` does not run tests or Markdown checks.
