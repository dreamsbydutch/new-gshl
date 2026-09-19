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

`AppShell` omits navigation and spacing for `/draft-roster-board` and its companion TV routes. These displays contain no links to the app or one another; their only in-app entry points live in the commissioner-only `/admin?view=tv` panel. The overview uses muted slate surfaces, fits abbreviated player names to each roster panel, and shows the existing career owner ladder filtered to the displayed owners in the center; the companion screens show larger best-available tables and a read-only draft flow with the clock at the top, current roster in the middle, completed picks descending on the left, and upcoming picks ascending on the right. The live screen also shows the first roster before the draft starts, and respects reduced-motion preferences when animating pick changes. Every other route uses one persistent shell: a safe-area-aware mobile header, a labeled mobile bottom navigation, and the equivalent desktop top navigation. The More menu adds Admin only for commissioners. The shared season selector is embedded in the header on Schedule and Standings only, instead of occupying a separate row. It highlights historical context and provides a compact return to the current season on desktop. Draft destinations remain in that global shell and expose Draft Board, My Draft Team, and Other Teams through route-level context navigation.

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

Schedule and Standings share one persisted season selection, including their URL context. The header only exposes the season picker on those two routes. Visiting another page does not replace that remembered selection. Other consumers of `useSeasonState` use the current pickable season (or the existing default-season fallback), so browsing old standings does not change the Home dashboard, My Team, or League Office. My Team and League Office canonicalize old season URLs to their current operational context without writing the shared season store. Matchup detail links retain their own game context and can return to a historical Schedule.

My Team Matchups has a local Years disclosure with multiple season checkboxes, All years, and Latest year. It defaults to the latest season with matchup history for that owner and filters the same rows used to calculate the win/loss/tie record. Game-type and opponent filters combine with that selection. Changing owners resets those local filters. Draft Picks retains its independent single-season selector. Neither local selector changes the shared Schedule/Standings season. Live Draft Hub, UFA, and commissioner job targets retain their configured operational seasons.

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

Tailwind is the only styling system. Reuse primitives from `components/ui`, CSS variables from `src/styles/globals.css`, and existing skeletons before adding new foundations. The shell owns global safe-area and navigation clearance for the mobile and desktop headers. On mobile, feature layouts place one `PageContextNavigation` dock directly above the persistent primary navigation and declare whether it contains one or two compact 36px control rows; on desktop the same surface remains sticky below the global header. Detail routes replace the mobile Home destination with their context-aware Back action so core movement stays in the thumb zone. Mobile primary destinations and consequential actions retain 44px targets and visible labels. Secondary and tertiary navigation stays low-profile at 36px with strong focus indicators; season pickers use native select behavior. A global reduced-motion fallback disables nonessential animation and smooth scrolling.

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

Wide comparison tables use `TableViewport`, which supplies a labelled, keyboard-focusable horizontal region, native scrolling, overflow hints, and edge fades without owning feature data or sticky-column offsets. Transactional Draft player pools use the same compact comparison table at every width. Player names freeze on the left (abbreviated on phones), small Draft buttons freeze on the right, and all ranking/stat columns sort from their headers. Separate skater and goalie tables retain relevant stat columns. A modal confirms the full player name, team, and pick, handles pending/error states, and restores focus on cancel. Draft team pages order roster, picks, and salary cap on phones; desktop shows picks first with roster and cap side by side. UFA player pools and pending contract offers retain horizontally scrollable comparison tables at every width; phones use one narrow, truncated, logo-led player identity column instead of separate sticky logo and name columns. Matchup category and player-stat results follow the same table-first pattern, with compact logo-led identity columns preserving context while the statistics scroll. Salary Cap keeps its cross-season table at every width, freezes a compact player-name column on phones, and shows remaining cap only in the table's Cap Space row. Its Roster Planner uses the same cap table at every width, with add-player controls above, remove/restore actions beside names, signing/trade notes, and aligned current/planned cap-space totals below. Removed contracts remain muted and restorable. A link opens the dedicated My Team trade-block view for league-visible listings. Franchise contract history uses a compact, horizontally scrollable table at every width, with a sticky player column for comparison. Record Book uses a compact Contracts-style table at every width, with sortable dark headers, alternating row backgrounds, and all statistics and honors available by horizontal scrolling. Player-history points are derived from goals plus assists for Career and By year, including seasons that did not track points; sorting uses the derived total. Stored statistics and league calculations are unchanged. Player-history years use abbreviated labels and group only consecutive seasons (for example, `'19, '21` or `'19–'21, '24`). Player-history trophy icons use alpha-transparent local PNG assets under `public/awards`, shared through the award catalog. Award columns follow the selected player group and season type: regular-season all-stars/Crosby for both groups, Brodeur for goalies, Lidstrom/Gretzky/Ovechkin for skaters, and only Conn Smythe for playoffs. Player names stay frozen at the left edge at every width; the season and NHL-team columns scroll with the statistics. Record Book and Current Contracts abbreviate first names on phones (for example, S. Crosby), retaining full names for screen readers, title hints, and desktop display. Draft Classes pairs a compact logo-led list below `lg` with a keyboard-scrollable table above it. Power Rankings pair a mobile list and semantic desktop table with an aria-hidden chart plus an exact keyboard-accessible history table. Playoff rounds stack in reading order below `lg` and retain the connected bracket at larger widths.

Standings subscribes only to inputs used by the selected view. Ordinary tables defer matchup, category, and player-leader detail to a season/team query mounted inside the expanded row; Power, Playoff, and Awards omit each other's unused datasets while retaining their existing loading states.

Locker Room Team History uses one owner-scoped realtime projection instead of subscribing to complete matchup, season, enriched-team, and week collections. Season, game-type, and opponent filtering remains client-side over that bounded history payload, and expanded matchup rows continue to fetch their two team-week stat fragments lazily.

Weekly Schedule, Team Schedule, and Matchup Details each subscribe to a page-shaped backend response. Their season, week, owner, or matchup selection is sent as the query key; the response contains only referenced relations and rendered statistic fields. Team Schedule and Team History defer the two-team weekly-stat comparison until a matchup row expands. Conference Contest similarly receives derived ratings and count maps instead of the historical source collections used to compute them.

The Home dashboard limits preview inventory instead of rendering complete feature lists: five UFAs, eight power rankings, five recent events, and four first-round mock-draft projections. Home UFA data uses a server-selected catalog containing its ranked preview candidates and any players in unresolved offer groups, while League Office retains the full projected catalog; NHL statistics still come from the latest populated season. The mock-draft and power-ranking cards each use capped server projections that return only rendered fields and referenced branding, while Draft Status uses the clock-only query rather than the joined draft board. Full destinations and an activity expansion remain explicit. Press Box cards and Newsroom lists receive compact metadata, then subscribe to one full edition only after the reader opens it or a commissioner selects it. The Press Box reader portals its modal outside inert application content, traps keyboard focus, supports Escape, and restores focus to its trigger.

Home's compact modules use a centered reading measure. When a linked owner has affordable UFA candidates, the player decision surface breaks out to the full dashboard width and retains its scrollable statistics and offer table at every breakpoint.

## My Team layout

The Locker Room uses a single 36px section-navigation row on mobile. Team
selection lives in a labelled **Team** dropdown in the global header, showing
the selected team and its logo on mobile and desktop. The menu lists team logos
and names with keyboard navigation and a selected-team indicator. Active teams
appear first; inactive owners appear below with their newest recorded team, owner
name, last season, and an Inactive label. Selection is owner-based, including former
owners absent from the current season; all My Team views resolve the same representative
team. Draft Picks defaults former owners to their last recorded season. Switching teams preserves the active
My Team section and its URL context. The route layout owns URL/store synchronization;
the header reads the same selection and navigates without a competing synchronization effect. The route owns horizontal spacing,
and the compact team header stays above all six views. The roster retains its
rink-style positional lineup and two-column bench, including player ratings
and salary badges. Matchups,
Records, Draft, and contract history use plain rows and section dividers.

Salary Cap separates Contracts, Planner, and History with local view buttons.
Hidden panels remain mounted so switching within Cap preserves an unfinished
planner scenario. These local buttons do not change the existing shareable
`view=salary` route; team and primary section navigation still use the
validated URL and persisted context. Matchup years are independent local filters. The planner remains a private simulation.

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

### NHL abbreviation aliases

Player team parsing normalizes aliases before deduplicating logo lists. Catalog
lookup prefers the canonical abbreviation and accepts an alias-only catalog.
The NHL catalog audit found these 12 duplicate pairs:

| Alias | Canonical |
| ----- | --------- |
| ANH   | ANA       |
| CAL   | CGY       |
| CLB   | CBJ       |
| LA    | LAK       |
| MON   | MTL       |
| NAS   | NSH       |
| NJ    | NJD       |
| SJ    | SJS       |
| TB    | TBL       |
| VEG   | VGK       |
| WAS   | WSH       |
| WIN   | WPG       |

The remaining catalog abbreviations are ARI, BOS, BUF, CAR, CHI, COL, DAL,
DET, EDM, FLA, MIN, NYI, NYR, OTT, PHI, PIT, SEA, STL, TOR, UTA, and VAN.
Supported stat-source variants also map ARZ to ARI, CLS to CBJ, NASH to NSH,
and UTAH to UTA. Unknown abbreviations are preserved. Historical relocations
are not merged (for example, ARI and UTA remain distinct). This is a display
normalization; stored catalog and statistical records are unchanged.

### My Team trade block

The Trades tab renders compact selected-owner listings above the league market, with a 48rem maximum width on desktop. A My Team visit without an explicit owner opens the signed-in owner's team ahead of any persisted selection. Explicit owner links and dropdown selections still take precedence; viewers without a linked team retain the existing stored/first-team fallback.
A List player button opens the player/request editor only for the signed-in
owner's selected team, and each owned listing has an Edit action. Switching
owners remounts the form so drafts cannot carry between teams. Market search
and position filtering share one mobile row; requests wrap so they remain
readable. The existing server ownership checks still authorize all writes.

League Office no longer shows a Trade tab. Legacy links and persisted Trade
selections resolve to `/lockerroom?view=tradeBlock`; home shortcuts, sharing,
and the roster planner use that destination too. No schema or API change is
needed: the existing market query provides the viewer and public owner IDs.
