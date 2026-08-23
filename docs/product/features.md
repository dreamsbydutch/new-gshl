# Implemented features

[Wiki home](../README.md) · [Product vision](vision.md) · [Route reference](../reference/routes.md) · [Frontend architecture](../architecture/frontend.md)

This page catalogs behavior implemented on active routes. It is not a roadmap. Trace a feature from the [route reference](../reference/routes.md) before changing similarly named legacy code.

## Audiences and capabilities

| Audience      | Implemented capabilities                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public reader | Read schedules, matchup detail, standings, playoffs, awards, power rankings, published Press Box editions, free-agency activity, and the rulebook.        |
| Active viewer | Use protected member areas in read-only form, including the Locker Room, Draft Hub, and League Office.                                                    |
| Linked owner  | Receive their team as the default context, submit their own on-clock draft pick, and place one binding UFA offer per player when eligible and affordable. |
| Commissioner  | Manage user access, create contracts, run operational jobs, manage editions and images, make expired-clock picks, and undo the latest live draft pick.    |

New verified Google accounts are currently created as active viewers. Linking an owner record and assigning elevated roles are commissioner operations.

## Public league experience

### Home

The home page assembles season-aware cards rather than maintaining independent page state. Depending on available data and the league calendar it can show:

- the active Press Box edition in a modal reader;
- the UFA window, active offers, and top free agents;
- power rankings for the globally selected season;
- recent signings, trades, roster moves, and missed starts;
- a countdown or link to the live Draft Hub; and
- an offseason mock-draft preview.

Linked owners see a My Team command center before the league modules. It
combines the current roster and open lineup slots, a three-season cap window,
upcoming contract decisions, the next matchup and five-game form, draft-pick
inventory, pending UFA offers, active trade-block listings, and recent trade
leads. The four primary actions open the trade market, listing controls, UFA
offers, and the next matchup. New trade-listing activity is tracked as read per
owner in that browser; the application does not yet store direct trade
proposals or cross-device read receipts.

The dashboard keeps these modules compact: Home shows five UFA candidates, eight power-ranking entries, five recent events, and four first-round mock-draft projections. Readers can expand the recent activity list in place or follow the visible links to the complete UFA, standings, Press Box, Draft Hub, and mock-draft surfaces.

### Schedule and matchup detail

The schedule supports weekly and team views. Season, week, and team selections are shared with the rest of the application and encoded in the URL for reload, sharing, and browser history. Weekly views merge matchup, team, player, and weekly-stat data; team views show the selected team's full season. Selecting a matchup carries its source context into `/matchup/[matchupId]`. On phones and tablets, category results become explicit Win/Loss/Tie comparison rows and player statistics become identity-first cards with every remaining statistic in a 44px disclosure; comprehensive tables remain available on large screens. Away/Home player tabs update the URL and deterministic return links restore the originating context.

### Standings and league results

One standings surface provides overall, conference, wildcard, power-ranking, playoff-bracket, and season-award views. The calculations are built from season-scoped matchups, teams, weeks, team statistics, player totals, and awards. Power Rankings use readable cards below `md`, a semantic table above it, and an exact expandable history table alongside the visual chart. Playoff rounds stack chronologically below `lg`; the connected bracket remains on larger screens. Scheduled playoff games retain unavailable scores instead of appearing as played 0-0 results.

### Press Box

Published editions have a public archive and detail page. The current home-active issue can also open directly over the home page. Hidden editions are not returned to public readers. Edition content is grounded in stored fact packets even when wording is imported or manually edited.

### Rulebook

The public rulebook is generated from structured content in `src/content/rulebook.ts`. It supports search, section navigation, collapsible content, diagrams, and a print layout. `/rules` is an alias for `/rulebook`.

## Team and owner experience

### Locker Room

The Locker Room uses the selected owner and global league season to provide:

- current roster and lineup presentation;
- salary-cap table, future cap commitments, contract history, and an in-browser roster planner;
- franchise matchup history and filters;
- team trophies and awards;
- player and franchise record books; and
- current and future draft capital.

The roster planner is a private simulation. It supports incoming signings and
trades, outgoing contracts, before/after cap space for every covered season,
cap-compliance warnings, and a full scenario table. It does not persist its
hypothetical roster moves. Owners can separately publish or remove their own
contracted players on the persistent league trade block.

The cross-season cap table remains scrollable at every width, with nonsticky identity columns and a compact remaining-cap summary below `lg`. Franchise contract history becomes expandable cards below `lg`, while complete tables remain keyboard-scrollable in the shared viewport on larger screens. Roster Planner search, term, reset, move, restore, and trade-block interactions use touch-sized controls.

The Record Book follows the same responsive priority model: full player names, context, and position-specific headline statistics stay visible in mobile cards; sorting and disclosures expose every statistic and honor. The complete sortable record table remains available in `TableViewport` at `lg` and above.

### Summer free agency

The public view lists eligible UFAs, previous-season NHL statistics, fixed 125% salaries, active offers, deadlines, and calculated probabilities. A linked owner sees only affordable candidates and terms. Below the large-screen breakpoint, player and active-offer cards keep salary, key statistics, contract term, status, and the action together; full statistics remain in an expandable section. Binding offers use an inline review and confirmation step. Submitted offers reserve cap space while pending, and the server resolves an offer group after its shared deadline.

### Draft Hub

The authenticated draft area includes:

- a live ordered pick flow and server-aligned countdown;
- search, position filters, sortable player rankings, previous NHL statistics, and mock projections;
- mobile and tablet decision cards that keep priority rankings, statistics, eligibility feedback, and a staged Draft or Force Pick action together;
- owner-only submission while that owner's team is on the clock;
- commissioner-only submission after expiry and undo of the latest completed pick;
- a “My Team” salary, roster, and picks view; and
- an “Other Teams” selector and equivalent team view.

The standalone `/draft-roster-board` removes the normal application shell and lays out conference rosters plus best available players for a desktop draft display.

## League Office

All active users can access:

- offseason mock drafts;
- a realtime trade block with inherited cap terms, team identity, and owner notes;
- projected draft classes for several years;
- the full free-agent market;
- the rulebook;
- conference-versus-conference records and rating history; and
- the historical owner ladder.

Draft Classes provides four year-selectable projections with search, position
and certainty filters. Guaranteed UFAs are visually distinct from other
projected players; summary counts, mobile cards, and a complete desktop table
keep the class usable across screen sizes.

Commissioners additionally receive:

- contract creation with derived terms and cap validation;
- user role, status, and owner-link management;
- dry-run/apply operational jobs with progress, cancellation, and retry;
- Press Box generation, visibility, article toggles, validated imports, manual edits, and revision restoration; and
- authenticated image uploads through UploadThing.

## Shared behavior

- WhatsApp share controls use the league-provided WhatsApp mark and open the user's normal conversation chooser with editable, prefilled GSHL text and a direct application link. Detailed views use one section-level share when an aggregate message is useful: matchup shares include live or final status, score, winner emphasis, and three stars; contract-offer and trade-block shares summarize their current markets; season awards and trophy cases share one overall report. Commissioners can use every owner share control in addition to sharing Press Box editions, weekly schedules, power rankings, missed-start reports, standings, and composed league notes. Sharing is user-initiated; the application does not use a WhatsApp bot, Business account, or automated group posting.
- One global season picker stays visible throughout the normal application shell. The selection presets season-aware pages and feature panels across navigation; historical selections use a distinct status treatment with a one-click return to the current season. Live Draft Hub, UFA, and commissioner job targets continue to use their configured operational seasons.
- Navigation state persists season, week, owner, and active view selections in the browser and mirrors contextual routes into validated query parameters. Shared URLs outrank hydrated persistence, Back/Forward restores user choices, and automatic default/invalid-state repairs do not add history noise.
- Route-level and feature-level skeletons preserve layout while realtime Convex queries initialize.
- The persistent shell uses a safe-area-aware, labeled bottom navigation and route header on mobile, then presents the same information architecture as a top navigation on large screens.
- Feature controls remain in one sticky context surface above page content. Draft routes retain the global shell and add Draft Board, My Draft Team, and Other Teams as contextual destinations.
- Wide comparison tables use one labelled, keyboard-focusable `TableViewport` with native horizontal scrolling, edge cues, and a visible overflow hint. Draft and UFA decision actions move to cards below `lg`; their comprehensive tables remain at larger widths.
- Bundled local typefaces avoid network-dependent font loading. Persistent copy uses readable sizing and contrast, shared mobile controls use 44px targets and visible focus treatment, native selects retain platform keyboard behavior, and reduced-motion preferences suppress nonessential animation.
- Schedule, Standings, Home, and every Matchup state expose labelled main content and page headings. Team-schedule rows use disclosure semantics, and the Press Box modal traps focus while making the background inert.
- The standalone roster board displays a desktop-required message below the `xl` breakpoint.
- Development builds log Core Web Vitals and client-navigation timings; production does not.

## Active versus legacy names

The active live-draft route uses `DraftHubBoard` and the transactional functions in `convex/draft.ts`. The following similarly named components are currently unreferenced by active routes and should not be treated as the live implementation without a new trace:

- `DraftBoardContent`
- `DraftAdminList`
- `DraftAnnouncement`
- `FreeAgencyList`

`/draftboard` is a protected compatibility redirect to `/draft`. `UfaSigning.tsx`, not `FreeAgencyList.tsx`, powers the current UFA surfaces.

## Known intent questions

- The standalone draft roster board is public in route code; confirm that this is intentional before placing private information there.
- Public data and member-only pages are not synonymous: many league reads are public by design, while owner email and owing amounts are redacted for unauthenticated readers.
