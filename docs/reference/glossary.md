# Glossary

[Wiki home](../README.md) · [Feature catalog](../product/features.md) ·
[Data model](../architecture/data-model.md)

This glossary defines software and league terms as the repository uses them.
The [official rulebook source](../../src/content/rulebook.ts) remains
authoritative for competition rules.

## League identity

| Term        | Meaning in this application                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GSHL        | The league and application. App metadata expands it as “Gem Stone Hockey League”; one legacy constant still says “Google Sheets Hockey League,” so the canonical expansion is an open product decision. |
| Owner       | A person and financial account. Owner IDs are the durable roster and team-award relationship.                                                                                                           |
| Franchise   | The enduring brand, logo, abbreviation, conference lineage, reporter, and owner relationship across seasons.                                                                                            |
| Team        | One franchise's season-specific instance. Team IDs change with the season.                                                                                                                              |
| Conference  | A league grouping shared by franchises and season teams.                                                                                                                                                |
| Season      | The scoring categories, roster slots, league dates, signing deadline, draft time, and active-state container for competition data.                                                                      |
| Week        | A season-scoped date window and competition type used by matchups and daily/weekly stats. Week IDs are not portable across seasons.                                                                     |
| Season type | A stat/standing partition such as regular season, playoffs, or another configured tournament phase. Use stored values and existing domain utilities rather than inventing labels.                       |

## Players, rosters, and transactions

| Term                    | Meaning in this application                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Player owner            | `players.ownerId`, the stable current GSHL owner relationship used across season-team rows.                                       |
| Current team assignment | `players.gshlTeamId`, the current season's team instance; it is not a historical ownership key.                                   |
| Position eligibility    | One or more NHL/fantasy positions plus the broader forward/defense/goalie position group used for lineup and rating logic.        |
| Lineup position         | The assigned daily roster slot. Rebuilds derive it from eligibility, ownership, activity, and configured roster spots.            |
| Contract                | A player-owner agreement with type, term, salary/cap hit, dates, and signing/expiry status.                                       |
| UFA                     | The summer unrestricted-free-agent workflow that accepts binding, cap-checked offers after the configured signing deadline.       |
| Offer group             | All offers for one player and season sharing a deadline and one resolution roll.                                                  |
| Draft pick              | A season-scoped ordered selection with current/original team, round, pick number, clock timestamps, and optional selected player. |
| On the clock            | The current open draft pick. The linked owner selects before expiry; commissioner recovery rules apply after expiry.              |
| Draft Hub               | The active authenticated live-draft and draft-team experience under `/draft`. `/draftboard` is only a compatibility redirect.     |

## Competition and analytics

| Term               | Meaning in this application                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player day         | The raw GSHL stat grain for one player, team, week, and calendar date. This is the main league aggregation source.                                               |
| Player week        | A derived rollup of player days for one week and team.                                                                                                           |
| Player split       | A derived season/team/season-type player total.                                                                                                                  |
| Player total       | A derived season/player/season-type total that may span more than one team.                                                                                      |
| Career split/total | Cross-season derived player summaries by team or across all teams.                                                                                               |
| NHL stat line      | External NHL-season performance used by ratings, draft, and UFA views; it is not derived solely from GSHL player days.                                           |
| Rating             | A numeric performance score computed by the shared ranking runtime. It is distinct from a placement.                                                             |
| Rank               | A placement assigned after comparing ratings or another metric within a defined cohort.                                                                          |
| Power rating       | An entering-week team strength snapshot blending recent results, Elo, roster talent, and GM history. Week N play affects Week N+1, not Week N's stored snapshot. |
| Parity             | Agreement between two implementations or stored/recomputed outputs for the same inputs. File hash parity alone does not prove numerical parity.                  |

## Publishing and operations

| Term                       | Meaning in this application                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Press Box / weekly edition | A structured league publication with facts, articles, visibility, homepage state, generation mode, and revision history.                                           |
| Managed job                | A durable Convex run with mode, scope lock, progress, events, cancellation/retry, and optional schedule. Not every managed processor yet matches its local script. |
| External task              | A leased outbound fetch/browser request for Yahoo, PuckPedia, or Hockey Reference. The worker returns bounded captures and does not write league tables.           |
| Artifact                   | Output attached to a job, either as stored content or an external result. Inspect contents before sharing.                                                         |
| Dry run                    | A plan/validation run that reports intended effects without persisting them. Verify the command actually supports dry-run; `convex:migrate` does not.              |
| Apply                      | Explicit permission for a supporting command or managed job to persist its planned writes. It is not implied by running the command or editing code.               |
| Archive manifest           | The Convex/SQLite record of completed-season player-day counts, checksums, highlights, activity snapshot, backup, and lifecycle state.                             |
| Highlight                  | A selected player day intentionally retained in Convex after raw completed-season days may be archived.                                                            |

## Technical ownership

| Term                  | Meaning in this repository                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth       | The file or system agents must edit/read as authoritative for a contract. Examples: `convex/schema.ts` for storage and `scripts/src/runtime/apps-script/` for shared rating/power code. |
| Generated             | Produced by tooling and never hand-edited, such as `convex/_generated/`.                                                                                                                |
| Synchronized output   | A checked-in deployment copy updated from an authoritative source, such as the matching rating/power files under `apps-script/`.                                                        |
| Compatibility surface | Code retained for migration, legacy IDs, Sheets access, or old routes. It is not a preferred foundation for new features.                                                               |
| Convex ID             | Canonical `_id` used by relationships; adapters often expose the same value as `id`.                                                                                                    |
| Legacy ID             | An imported historical/Sheets identifier stored as `legacyId`. Resolve it only at explicit compatibility boundaries.                                                                    |
