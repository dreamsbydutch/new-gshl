# Product vision

[Wiki home](../README.md) · [Implemented features](features.md) · [Frontend architecture](../architecture/frontend.md) · [Route reference](../reference/routes.md)

## Product summary

GSHL is the operating application for a long-running fantasy hockey league. It complements Yahoo with the league-specific records and workflows Yahoo does not own: contracts and cap accounting, draft order and live selections, custom matchup results, league awards, free agency, historical records, and commissioner operations.

The application already serves public readers, signed-in league members, linked team owners, and commissioners. The rulebook in `src/content/rulebook.ts` defines which decisions belong to Yahoo and which belong to the GSHL App; product documentation should preserve that distinction instead of presenting every calculated screen as a new source of authority.

## Implemented foundation

The current product provides:

- public schedules, matchup detail, standings, playoffs, awards, power rankings, headlines, and the rulebook;
- authenticated locker rooms, team history, roster and draft-capital views, a live draft hub, and league-office tools;
- owner actions for live draft picks and binding unrestricted-free-agent offers;
- commissioner controls for access, contracts, operational jobs, editorial editions, images, and draft recovery;
- a season-aware historical model covering teams, owners, players, contracts, draft picks, matchups, awards, and multiple levels of statistics; and
- a responsive application shell, with a separate large-screen roster board for use during the draft.

[The feature inventory](features.md) records the implemented behavior in more detail.

## North star

The product north star is a single, dependable league home where a participant can understand what is happening now, why it happened, and what it means for their team without reconstructing state across spreadsheets, chat threads, Yahoo, and commissioner memory.

That direction implies five durable outcomes:

1. **Trusted league state.** Results, rosters, contracts, cap commitments, picks, awards, and historical records agree across every view.
2. **Transparent competition.** Standings rules, draft order, rankings, free-agent odds, and other GSHL-specific calculations are inspectable and traceable to verified inputs.
3. **Safe self-service.** Owners can complete the actions assigned to them, while sensitive or irreversible operations remain authorized and recoverable.
4. **Historical continuity.** A new season extends the same model rather than creating a disconnected application or one-off spreadsheet.
5. **Low-friction administration.** Routine ingestion, aggregation, publishing, and maintenance are automated, observable, and dry-run-first where practical.

The north star describes direction, not unimplemented acceptance criteria. A capability belongs in the implemented feature catalog only after it can be traced from an active route to working code.

## Product principles

- Treat the official rulebook and stored league data as products, not incidental implementation details.
- Prefer one canonical calculation per league rule and reuse it across views.
- Make season, week, team, and role context visible whenever it changes the meaning of data.
- Keep public reading useful while protecting private owner data and all mutations at the server boundary.
- Design live workflows for stale data, retries, clock expiry, and commissioner recovery.
- Preserve source facts when editorial or AI-assisted copy is generated; presentation may change, facts may not.
- Optimize for league participants first, while keeping operational tools understandable to a future commissioner or maintainer.

## Product boundaries

- Yahoo remains authoritative for the areas assigned to it by the rulebook.
- The GSHL App is authoritative for league-specific areas Yahoo does not track or cannot administer correctly.
- Convex is the active application data and realtime backend. Google Sheets code remains for compatibility, ingestion, and operational workflows; it is not the browser application's current query layer.
- Role-based controls shown in the UI are guidance. Server-side authorization is the security boundary.

## Intent questions to resolve

These are current ambiguities, not repository rules:

- Confirm the canonical expansion of “GSHL”: app metadata says “Gem Stone Hockey League,” while a legacy constant says “Google Sheets Hockey League.”
- Confirm whether `/draft-roster-board` is intentionally public as well as excluded from search indexing.
- Decide what a first visit to the League Office should show; the persisted default is `home`, but no home panel currently exists.
- Revisit the desired public/member boundary as private owner details and additional self-service workflows are added.
- Keep the rulebook's Yahoo-versus-app authority statement current as integrations evolve.
