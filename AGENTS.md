# Agent Instructions

These rules are mandatory for every coding agent. Read this file before making
changes and follow it strictly. This file overrides conflicting repository
guidance. Do not introduce a different architecture without explicit user
approval.

## Frontend Structure

Frontend code lives in `src/`:

```text
src/
├── app/                  # App Router files and API routes only
├── components/
│   ├── <feature>/        # Domain and feature UI
│   ├── ui/               # Domain-agnostic UI primitives
│   └── skeletons/        # Shared loading states
├── hooks/
│   ├── main/             # Remote/domain data hooks
│   └── features/         # Feature orchestration and view models
├── lib/
│   ├── types/            # Shared frontend types
│   └── utils/
│       ├── core/         # Generic pure helpers
│       ├── domain/       # Shared domain rules
│       └── features/     # Pure feature transforms
├── server/               # Server-only code and tRPC implementation
├── trpc/                 # tRPC adapters and providers
├── styles/               # Global styles
└── content/              # Static content
```

Use the narrowest existing folder. Do not create new top-level `src/` folders
or alternatives such as `common`, `helpers`, `services`, or `shared` without
explicit approval.

## Layer Boundaries

Dependencies flow downward:

```text
app → components → feature hooks → main hooks / cache / tRPC
                 ↘ utilities → types
```

- `app`: Keep routes thin. They may prefetch, hydrate, and compose feature
  entry points. Reusable UI, types, and business logic do not belong here.
- `components`: Rendering and interaction only. Never import tRPC, server,
  cache, or `next/navigation` directly; access data and navigation through
  hooks.
- `hooks/main`: Stable hooks for remote/domain queries and mutations.
- `hooks/features`: Combine hooks and build feature view models. Hooks never
  import components.
- `lib/utils`: Pure, framework-free logic. Never import React, Next.js, hooks,
  or components.
- `lib/types`: Types only. No runtime logic or dependencies on components,
  hooks, utilities, React, or Next.js.
- Client code must never import `server`, `app/api`, or server-only tRPC code.

## Code Rules

- Prefer Server Components. Add `"use client"` only at the lowest boundary
  that requires client behavior.
- Put substantial route UI in `components/<feature>`.
- Keep `components/ui` domain-agnostic and reuse existing primitives and
  skeletons before adding new ones.
- Use PascalCase filenames and named exports for components. Framework route
  files are the default-export exception.
- Component and route files must not declare type aliases or interfaces. Put
  shared frontend types in `lib/types`.
- Move data access and complex orchestration into hooks; move deterministic
  calculations into utilities.
- Hooks start with `use`, return named objects, and keep option/result types in
  `lib/types`. Effects are for external synchronization, not derived state.
- Never mutate props, query results, or hook output.
- Prefer `@gshl-*` aliases across layers and relative imports within a small
  feature subtree. Avoid deep relative imports and circular dependencies.
- Use `import type`, avoid `any` and unsafe assertions, and preserve strict
  TypeScript behavior.
- Use Tailwind and existing design primitives. Do not add another styling
  system or component-local rules to global CSS.
- Preserve accessibility, responsive behavior, and overflow handling.
- Keep changes scoped. Remove dead/debug code and do not perform unrelated
  refactors or mass formatting.

## Agent Workflow

Before editing:

1. Check `git status` and preserve user changes.
2. Read the relevant route, component, hook, utility, and type files.
3. Search for existing code before creating a duplicate.
4. Confirm the correct layer for every new file.

Before finishing:

1. Recheck these boundaries.
2. Run targeted formatting, lint, type checks, and relevant tests for the
   affected scope.
3. Add focused tests for new non-trivial logic.
4. Report checks not run and pre-existing failures honestly.

Do not routinely run the full workspace test suite; CI owns full verification
unless the user explicitly requests it.

Treat architecture violations as defects. If a request requires breaking these
rules, explain the conflict and get explicit direction first.
