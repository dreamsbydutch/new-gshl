# Route reference

[Wiki home](../README.md) · [Implemented features](../product/features.md) · [Frontend architecture](../architecture/frontend.md)

This reference follows active App Router files under `src/app`. “Public” means the route has no active-user page guard; individual mutations may still require an owner or commissioner.

## Page routes

| Route                      | Access                   | Active entry                                  | Purpose                                                                                                                                             |
| -------------------------- | ------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Public                   | `HomeContent`                                 | Compact season-aware previews for Press Box, UFA, rankings, activity, and draft/offseason destinations.                                             |
| `/signin`                  | Public                   | `SignInContent`                               | Google sign-in and safe callback redirect. Active sessions redirect to the requested internal path or `/lockerroom`.                                |
| `/schedule`                | Public                   | `ScheduleContent` in `ScheduleLayout`         | Weekly or selected-team schedule with URL-addressable season/week/team controls.                                                                    |
| `/standings`               | Public                   | `StandingsContent` in `StandingsLayout`       | URL-addressable standings plus responsive power-ranking, playoff, and award views.                                                                  |
| `/matchup/[matchupId]`     | Public                   | `MatchupPageContent`                          | Matchup summary plus responsive category and player-performance detail; source and selected team live in the URL.                                   |
| `/headlines`               | Public                   | `HeadlinesArchiveContent`                     | Archive of published Press Box editions.                                                                                                            |
| `/headlines/[editionId]`   | Public                   | `WeeklyEditionPageContent`                    | One published edition; hidden or unknown IDs render an inline unavailable state.                                                                    |
| `/rulebook`                | Public                   | `Rulebook`                                    | Searchable, navigable, printable official league rules.                                                                                             |
| `/rules`                   | Public alias             | Server redirect                               | Redirects to `/rulebook`.                                                                                                                           |
| `/lockerroom`              | Active user              | `LockerRoomContent` in `LockerRoomLayout`     | URL-selected team's roster, cap, matchups, trophies, records, and picks.                                                                            |
| `/leagueoffice`            | Active user              | `LeagueOfficeContent` in `LeagueOfficeLayout` | URL-addressable draft classes, trade block, league reference views, and role-gated commissioner panels; invalid or fresh state opens Draft Classes. |
| `/leagueoffice/mock-draft` | Active user              | `LeagueOfficeMockDraft`                       | Mock draft for the upcoming season during a resolvable offseason window.                                                                            |
| `/draft`                   | Active user              | `DraftHubBoard` in `DraftHubLayout`           | Transactional live draft board with responsive player decision cards and a comprehensive large-screen table.                                        |
| `/draft/my-team`           | Active user              | `DraftHubTeamPage`                            | Draft-season salary, roster, and picks for the session's linked owner.                                                                              |
| `/draft/teams`             | Active user              | `DraftHubTeamPage`                            | Equivalent view for another owner selected through the `owner` query parameter.                                                                     |
| `/draftboard`              | Active user legacy alias | Server redirect                               | Authenticates, then redirects to `/draft`.                                                                                                          |
| `/draft-roster-board`      | Public, `noindex`        | `DraftRosterBoard`                            | Shell-free large-screen conference roster and best-available display.                                                                               |

`src/app/not-found.tsx` supplies the global App Router not-found page. Dynamic matchup and edition screens currently render their own missing-data states instead of calling `notFound()`.

## API routes

| Route                     | Methods   | Authorization                     | Purpose                                                         |
| ------------------------- | --------- | --------------------------------- | --------------------------------------------------------------- |
| `/api/auth/[...nextauth]` | GET, POST | Auth.js protocol                  | Google OAuth and session handlers.                              |
| `/api/convex/token`       | POST      | Active Auth.js user               | Returns a short-lived custom JWT for the browser Convex client. |
| `/api/convex/jwks`        | GET       | Public protocol endpoint          | Publishes the public key used by Convex to verify custom JWTs.  |
| `/api/uploadthing`        | GET, POST | Commissioner in upload middleware | UploadThing route for a single image up to 8 MB.                |

## Guard behavior

`middleware.ts` matches:

- `/lockerroom/:path*`
- `/draft/:path*`
- `/draftboard/:path*`
- `/leagueoffice/:path*`

Draft, League Office, and Locker Room call `requireActiveUser` at page boundaries so each guard can preserve the complete requested path and query string through sign-in. Safe callback normalization accepts only an internal destination. Authorization-sensitive Convex operations perform their own role and ownership checks even when a route is already protected.

Do not infer access solely from the main navbar. Protected destinations remain visible navigation choices because presentation is not authorization; route guards and server checks remain authoritative.

## Shell and navigation by route

- Normal routes use `AppShell` and one `MainNavbar`. Mobile renders a route-aware header plus labeled Home, Schedule, Standings, My Team, and More destinations; large screens render the same information architecture in a top bar.
- More exposes Press Box, Rulebook, League Office, and Draft Hub. Matchup and detail routes keep their parent destination active; Matchup back links restore their allowlisted Schedule, Locker Room, or Press Box source context.
- `/draft` and its child routes retain the global navigation and add Draft Board, My Draft Team, and Other Teams in their context navigation.
- Draft player decisions render as identity-first cards below `lg`, with staged confirmation and 44px controls. UFA decisions and matchup category/player statistics retain horizontally scrollable tables at every breakpoint, using compact logo-led identity columns to preserve context on phones.
- Salary Cap remains a cross-season table at all widths with a compact mobile cap summary and nonsticky phone identity columns. Its Roster Planner exposes cap deltas and move cards at every width, with the complete scenario table in a disclosure. Franchise contract history uses cards below `lg` and its comprehensive table above that breakpoint.
- Record Book uses sortable priority cards below `lg` and its complete honors/statistics table above that breakpoint. Power Rankings use cards below `md` plus an exact accessible history table; playoff rounds stack below `lg` and form a connected bracket above it.
- `/draft-roster-board` bypasses the shell entirely.
- Schedule, Standings, Locker Room, League Office, and Draft layouts place one sticky context-navigation surface before route content. These controls do not add fixed bottom bars or route-specific navigation padding.
- Navigation context is persisted in `gshl-nav-state` and mirrored to route-specific `view`, `season`, `week`, and `owner` query parameters. Valid URL state wins over hydrated persistence; user changes support Back/Forward, while automatic repair replaces the current entry.

## Active route traces

When names overlap, follow these traces before editing:

```text
/draft
  → DraftHubBoard
  → useDraftHubBoard
  → useDraftHubState / useSubmitDraftPick / useUndoDraftPick
  → convex/draft.ts

/leagueoffice?view=freeAgents
  → LeagueOfficeContent
  → UfaLeagueOffice in UfaSigning.tsx
  → useUfaOverview / useSubmitUfaOffer
  → convex/ufa.ts

/leagueoffice?view=tradeBlock
  → TradeBlock
  → useTradeBlockMarket
  → convex/tradeBlock.ts

/standings
  → StandingsContent
  → useStandingsData
  → useSeasonDataBundle and pure standings/ranking utilities
```

`DraftBoardContent`, `DraftAdminList`, `DraftAnnouncement`, and `FreeAgencyList` are not active route entries today.

## Intent questions

- `/draft-roster-board` is public in current route code but carries `noindex` metadata. Confirm the intended audience before adding data.
- Middleware and server page guards overlap on some routes and differ on `/draft`; this is current implementation, not a recommendation to duplicate every guard.
