# Coding Standards

A concise reference to the architectural conventions used across this codebase.

---

## Layered Responsibilities

- **Components (UI)**: Pure rendering. 1 file = 1 export. No data fetching, no business logic, no heavy transforms. Compose hooks and render props.
- **Hooks (Data Orchestrators)**: Fetch, compose, transform, and prepare data for the UI. Use an options-object API, return a consistent contract `{ ..., isLoading, error }` (and `ready` when helpful).
- **Utils (Heavy Lifting)**: Perform domain logic, calculations, transforms, parsing, formatting. Prefer pure, reusable functions. Unit-test friendly.
- **Types (Contracts)**: Shared types/enums/interfaces live in `src/lib/types`. Keep only very file-local types inline.

---

## Components

- Functional components only; presentation-first.
- 1 file = 1 export; internal helpers as `const` in the same file.
- Receive data via props from hooks; avoid fetching and business logic.
- Handle user interaction by calling prop callbacks; avoid complex state.
- Name files and exports with PascalCase (e.g., `TeamRoster.tsx`).

See also: `docs/frontend/COMPONENTS.md`.

---

## Hooks

- Hooks own data orchestration and business rules that prepare UI models.
- Accept a single options object (backwards compatible, self-documenting).
- Return a consistent object including `isLoading` and `error`.
- Compose smaller hooks and utils; memoize expensive transforms.
- Keep responsibilities focused (prefer multiple small hooks over one large).

See also: `docs/frontend/HOOKS.md`.

---

## Utils

- Centralize reusable logic in `src/lib/utils/**` (domain, features, shared).
- Prefer pure functions; no side-effects or I/O in utils.
- Co-locate only if utility is truly file-specific; otherwise promote to utils.
- Keep function names descriptive; avoid abbreviations; no 1–2 char names.
- Favor immutable transforms (clone before sorting/filtering).

See also: `docs/core-systems/UTILS.md`.

---

## Types

- Default location for shared types: `src/lib/types/**`.
- Promote interfaces/enums used across modules to the types package.
- Keep narrow, non-reused helper types inline within a file.
- Export types from folder barrels as needed for clean imports.

See also: `docs/core-systems/TYPES.md`.

---

## Error Handling & Linting

- Always handle async errors; avoid floating promises (use `await` or `void`).
- Never rely on default stringification for unknown errors; normalize to a string.
- Avoid unnecessary type assertions; let TypeScript infer where possible.
- Follow ESLint rules; fix warnings that indicate policy breaches.

---

## Naming & Style

- Descriptive names for variables/functions; avoid abbreviations.
- Components: PascalCase; hooks: `useCamelCase`; enums: PascalCase members.
- Prefer early returns and shallow nesting; keep functions small and focused.

---

## Imports & Aliases

- Use configured TS path aliases for clarity (see `docs/reference/IMPORT_ALIASES.md`).
- UI from `@gshl-ui`, hooks from `@gshl-hooks`, utils from `@gshl-utils`, types from `@gshl-types`.

---

## Testing

- Components are easy to test as pure renderers given props.
- Utils are pure and unit-testable.
- Hook behavior is testable in isolation from components.
