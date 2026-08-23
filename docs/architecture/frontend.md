# Frontend architecture

[Wiki home](../README.md) · [Implemented features](../product/features.md) · [Route reference](../reference/routes.md)

## Runtime shape

The active frontend is a Next.js 15 App Router application using React 18, strict TypeScript, Tailwind CSS, Convex realtime queries, Auth.js, and Zustand.

```text
src/app route
  → src/components feature entry
    → src/hooks/features orchestration hook
      → src/hooks/main data or mutation hook
        → Convex generated API

feature component / hook
  → src/lib/utils pure transforms
    → src/lib/types shared contracts
```

There is no active tRPC frontend. `src/trpc/` is empty. Browser data hooks call Convex directly through generated function references.

## Application bootstrap

`src/app/layout.tsx` owns the global HTML metadata and provider order:

1. `AuthProvider` exposes the Auth.js session.
2. `ConvexClientProvider` creates the browser Convex client and exchanges an active Auth.js session for a custom Convex JWT.
3. `AppShell` applies navigation and persisted defaults.
4. `Toaster` mounts shared mutation feedback.
5. `PerformanceVitals` records development-only diagnostics.

`AppShell` omits navigation and spacing only for `/draft-roster-board`. Every other route uses one persistent shell: a safe-area-aware mobile header, a labeled mobile bottom navigation, the equivalent desktop top navigation, and one global season bar. The bar keeps the selected league season visible and accessible everywhere, highlights historical context, and provides a direct return to the current season. Draft destinations remain in that global shell and expose Draft Board, My Draft Team, and Other Teams through route-level context navigation.

Typography is served from the bundled Geist Sans and Geist Mono files. Legacy `font-varela`, `font-barlow`, `font-oswald`, and `font-yellowtail` utilities remain compatibility aliases to the local sans variable, so rendering never depends on a font-network request and numeric tables can use the dedicated mono face.

## Layer responsibilities

### `src/app`

Contains framework route files and API handlers only. Page and layout files should authenticate, redirect, set metadata, or compose a feature entry point. Reusable rendering and business rules belong below this layer.

### `src/components`

Contains rendering and interaction grouped by product domain. Components consume hooks instead of Convex, the navigation store, `next/navigation`, server modules, or API route implementations directly. `components/ui` is domain-agnostic; `components/skeletons` supplies shared loading shapes.

The Auth.js and Convex provider components are explicit integration exceptions to the component import restrictions.

### `src/hooks/main`

Owns stable remote-data, mutation, Auth.js, navigation-adapter, and integration hooks. Main data hooks use Convex `useQuery`, `usePaginatedQuery`, or the shared `useAppMutation` wrapper and return named state objects.

### `src/hooks/features`

Combines main hooks, local interaction state, and pure utilities into feature-ready view models. Feature hooks never import components. Some hooks are transform-only; most active page hooks orchestrate several Convex subscriptions.

### `src/lib/utils`

- `core`: generic array, date, formatting, ID, validation, query-state, and math helpers.
- `domain`: shared hockey, season, contract, player, matchup, schedule, team, authorization, and runtime-constant rules.
- `features`: deterministic calculations for concrete UI features such as standings, draft, records, cap planning, UFA, and weekly editions.

Utilities are framework-free and should receive all inputs explicitly.

### `src/lib/types`

Holds shared frontend and domain types only. Runtime values that correspond to union types live in `src/lib/utils/domain/constants.ts`.

### Supporting `src/lib` areas

- `auth`: server-only route guards, custom Convex tokens, Auth.js augmentation, and user storage access.
- `cache`: the persisted Zustand navigation store.
- `config`: runtime display catalogs, currently awards.
- `data`: server-side Convex data adapter and model mapping.
- `sheets`: Google Sheets compatibility and operational adapters, not the active browser query layer.

`src/server` contains server-only integrations such as UploadThing.

## Data flow

`ConvexClientProvider` uses `useConvexAuth` to POST to `/api/convex/token`. The server signs a short-lived JWT whose subject is the application user ID; Convex resolves that subject against `authUsers` for authorization.

Main hooks call generated functions in `convex/_generated/api`. Feature hooks then join domain collections and apply utilities. Components render the returned view model and skeleton state. Convex subscriptions update those hooks without a React Query cache or manual refetch layer.

Most league collections are readable without authentication. `convex/frontend.ts` redacts private owner fields for anonymous readers. Draft state, commissioner queries, and every privileged mutation enforce access inside Convex or the relevant server integration.

Server-side Auth.js user upsert and lookup use `src/lib/data/convex-store.ts` with the shared Convex server secret. This path is separate from browser Convex authentication.

## Navigation state

`src/lib/cache/store.ts` persists `gshl-nav-state` with:

- schedule, standings, Locker Room, and League Office view keys;
- selected season and week IDs; and
- selected owner ID.

Feature navigation hooks expose narrow named objects. Route-owned season/week hooks replace invalid stored defaults once their data is available; the global `NavDefaults` does not fetch route-specific week data. Changing season resets the selected week because week IDs are season-specific. An owner or commissioner linked to an owner record is moved from the legacy owner default to their own team.

The selected league season is application context rather than a page-local filter. The shell owns its only selector, and season-aware Home, Schedule, Standings, Locker Room, League Office, matchup, draft-class, conference, team-history, award, and draft-pick surfaces consume that shared selection. Schedule, Standings, Locker Room, League Office, and matchup URLs also carry it so shared links can establish the global context. Live Draft Hub, UFA, and commissioner job targets retain their configured operational seasons where changing historical browsing context must not change an active workflow.

Contextual routes also mirror their active state into validated query parameters: `view`, `season`, `week`, and `owner`. A valid explicit URL wins over hydrated persistence; missing values may reuse persisted context, while invalid values resolve to a route or data default. User choices push a history entry, but hydration, automatic defaults, and invalid-value repair replace the current entry. URL-to-store synchronization waits for Zustand hydration and the season/week/team/auth data needed to validate each value, so shared links and browser Back/Forward do not briefly render a different persisted context.

Matchup links add allowlisted `from` and `side` values. The source restores a deterministic Schedule, Locker Room, or Press Box return destination, while Away/Home player-stat switches replace the current URL because they are presentational tabs rather than navigation milestones. Auth callbacks normalize same-origin absolute URLs back to safe internal paths so protected contextual links retain their query state through sign-in.

Components that need App Router behavior use `useAppPathname` or `useAppRouter`, keeping `next/navigation` in the hook layer.

## Authentication and roles

Auth.js accepts only verified Google identities. A successful first sign-in creates an active viewer. The session carries application user ID, role, optional owner ID, and status.

- `viewer`: protected read access, no owner or commissioner mutations.
- `owner`: viewer access plus authorized actions for the linked owner.
- `commissioner`: administrative access and recovery actions.

Route guards improve navigation behavior, but server-side checks in `convex/lib/auth.ts`, feature mutations, and `src/server/uploadthing.ts` are authoritative. Never rely on a hidden button as an authorization control.

## Rendering and loading

Routes are kept as Server Components where possible, but active feature entries are generally client components because they consume realtime queries and persisted navigation. Heavy subviews in the schedule, standings, League Office, and Locker Room are dynamically imported with matching skeletons.

There is currently no server prefetch/hydration layer. Do not document or introduce one as an existing convention.

## Imports and aliases

Prefer the narrow active aliases from `tsconfig.json`:

| Alias                              | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `@gshl-components/*`               | Feature and shared components                 |
| `@gshl-ui`                         | Domain-agnostic UI barrel                     |
| `@gshl-nav`                        | Navigation barrel                             |
| `@gshl-skeletons`                  | Loading-state barrel                          |
| `@gshl-hooks`, `@gshl-hooks/*`     | Hook barrels or narrow hook modules           |
| `@gshl-types`                      | Shared type barrel                            |
| `@gshl-utils`, `@gshl-utils/*`     | Pure utility barrels or narrow modules        |
| `@gshl-cache`                      | Persisted navigation store                    |
| `@gshl-lib/*`                      | Other library modules                         |
| `@gshl-auth`, `@gshl-env`          | Root authentication and validated environment |
| `@gshl-server/*`, `@gshl-convex/*` | Server or Convex-only modules                 |

Use relative imports inside a small feature subtree. Several configured aliases point to missing or inactive areas, so configuration alone is not evidence that a layer is active. `components.json` also contains legacy `~` aliases that TypeScript does not currently define.

## Styling and accessibility

Tailwind is the only styling system. Reuse primitives from `components/ui`, CSS variables from `src/styles/globals.css`, and existing skeletons before adding new foundations. The shell owns global safe-area and navigation clearance, including the fixed global season bar. On mobile, feature layouts place one `PageContextNavigation` dock directly above the persistent primary navigation and declare whether it contains one or two compact 36px control rows; on desktop the same surface remains sticky below the global navigation and season bar. Detail routes replace the mobile Home destination with their context-aware Back action so core movement stays in the thumb zone. Mobile primary destinations and consequential actions retain 44px targets and visible labels. Secondary and tertiary navigation stays low-profile at 36px with strong focus indicators; the season picker uses native select behavior. A global reduced-motion fallback disables nonessential animation and smooth scrolling.

Use the existing GSHL league, conference, GSHL team, and NHL team logos as the
default color accents. Prefer a relevant logo to tinted panels, gradients, or
decorative shading. A logo may replace repeated visible league, conference, or
team text when the context remains clear, but preserve the accessible name with
alt text, an `sr-only` label, or the surrounding labelled control.

GSHL identity is the primary brand layer. Give league, conference, franchise,
and GSHL team marks the prominent position and size. Treat NHL logos as compact
player metadata: normally 16-18px and placed immediately before the player's
name instead of receiving a separate high-emphasis column or tile. When both
appear in one row, the GSHL mark must remain clearly larger.

Time-scoped player statistics use the NHL team snapshot stored on that stat
line before the player's live team. Aggregated season rows render every unique
NHL team in the stored array as a compact logo group and fall back to live
player data only when the historical snapshot is empty.

Wide comparison tables use `TableViewport`, which supplies a labelled, keyboard-focusable horizontal region, native scrolling, overflow hints, and edge fades without owning feature data or sticky-column offsets. Transactional Draft player pools use decision cards below `lg`, keeping identity, priority metrics, disclosure of full statistics, visible eligibility feedback, and staged 44px actions together. UFA player pools and pending contract offers retain horizontally scrollable comparison tables at every width; phones use one narrow, truncated, logo-led player identity column instead of separate sticky logo and name columns. Matchup category and player-stat results follow the same table-first pattern, with compact logo-led identity columns preserving context while the statistics scroll. Salary Cap keeps its cross-season table at every width, drops sticky identity columns below `lg`, and surfaces remaining cap in a compact mobile summary. Its Roster Planner uses move cards and before/after cap summaries at every width, with complete scenario commitments in a disclosure. Franchise contract history and Record Book use identity-first cards below `lg`. Draft Classes pairs a compact logo-led list below `lg` with a keyboard-scrollable table above it. Power Rankings pair a mobile list and semantic desktop table with an aria-hidden chart plus an exact keyboard-accessible history table. Playoff rounds stack in reading order below `lg` and retain the connected bracket at larger widths.

Standings subscribes only to inputs used by the selected view. Ordinary tables defer matchup, category, and player-leader detail to a season/team query mounted inside the expanded row; Power, Playoff, and Awards omit each other's unused datasets while retaining their existing loading states.

Locker Room Team History uses one owner-scoped realtime projection instead of subscribing to complete matchup, season, enriched-team, and week collections. Season, game-type, and opponent filtering remains client-side over that bounded history payload, and expanded matchup rows continue to fetch their two team-week stat fragments lazily.

Weekly Schedule, Team Schedule, and Matchup Details each subscribe to a page-shaped backend response. Their season, week, owner, or matchup selection is sent as the query key; the response contains only referenced relations and rendered statistic fields. Team Schedule and Team History defer the two-team weekly-stat comparison until a matchup row expands. Conference Contest similarly receives derived ratings and count maps instead of the historical source collections used to compute them.

The Home dashboard leads with a full-width League Wire instead of separate
Press Box and power-ranking previews. It queries 24 durable posts and shows an
eight-story mix that favors distinct story types before filling with additional
recent posts. Weekly ranking snapshots, league-wide Three Stars, missed-start
reports, newsletter headlines, results, roster moves, UFA activity, trades, and
commissioner posts therefore share one chronological surface. Readers can
expand the Wire in place, open each stored deep link, inspect complete trade
packages, and share posts when their role permits. Home still caps its
actionable inventory at five UFA candidates and four first-round mock-draft
projections. League Office retains the full UFA catalog, and NHL statistics
still come from the latest populated season. Press Box archive and Newsroom
lists receive compact metadata, then subscribe to one full edition only after a
reader opens it or a commissioner selects it. The Press Box reader portals its
modal outside inert application content, traps keyboard focus, supports Escape,
and restores focus to its trigger.

Home's compact modules use a centered reading measure. When a linked owner has affordable UFA candidates, the player decision surface breaks out to the full dashboard width and retains its scrollable statistics and offer table at every breakpoint.

## Verification

The focused frontend gates are:

```text
npm run check:architecture
npm run lint
npm run typecheck
npx tsx --test <affected-test-file>
```

Tests use Node's built-in test runner and are colocated primarily with pure utilities. A narrow source-contract test protects page landmarks, disclosure semantics, native selection, reduced-motion policy, and Press Box modal behavior until a component test harness exists. There is no component, hook, browser, or end-to-end harness. `npm run check` does not run tests, and the repository currently has no general frontend CI workflow.

## Known edges, not preferred patterns

- `convex/frontend.ts` is a compatibility-heavy module using `@ts-nocheck`, broad `any`, and domain casts; new code should not copy that style.
- Many main hooks bridge generated Convex values to frontend domain types with `as unknown as`. Treat this as typing debt.
- Query hooks commonly expose `error: null`; do not promise React Query-style error/refetch objects.
- `src/trpc/` and some configured aliases are inactive.
- Similar legacy draft and free-agency components remain in the tree. Begin from an active route and follow imports before editing.
- `npm run format:check` does not include ordinary Markdown files.
