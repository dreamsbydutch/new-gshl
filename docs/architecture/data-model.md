# Data model

[Wiki home](../README.md) · [Architecture overview](./overview.md) · [Convex](./convex.md) · [Authentication](./authentication.md)

## Source of truth

[`convex/schema.ts`](../../convex/schema.ts) is the authoritative storage schema. Frontend interfaces in `src/lib/types/`, script interfaces in `scripts/src/types/`, legacy Sheets configuration, and generated declarations must follow it; they do not override it.

Most legacy-backed tables use the local `table()` helper. It adds:

- Optional `legacyId` for migration and external reconciliation.
- A `by_legacyId` index.
- Consistently named single- and multi-field indexes from the supplied index list.

Tables declared directly with `defineTable()` do not receive `legacyId` automatically.

## Relationship model

```text
Owner ──1:many── Franchise ──1:many── Team ──many:1── Season
  │                    │                    │
  │                    └── Conference ─────┘
  │
  ├── Player.ownerId             stable roster/ownership link
  ├── Contract.ownerId           contractual owner
  ├── AuthUser.ownerId           optional account-to-owner link
  └── UFA offer / team award     owner-scoped league operations

Player.gshlTeamId                current-season assignment only
Team.franchiseId                 season instance of an enduring franchise
```

Do not collapse these concepts:

- An owner is a person and financial account.
- A franchise is the enduring identity, branding, conference membership, and historical lineage.
- A team is one franchise in one season.
- Player ownership spans season-specific team rows, so `ownerId` is canonical for roster history.

## Table glossary

### Identity and league structure

| Table               | Purpose and important relationships                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authUsers`         | Google subject/email, application role, optional owner link, status, and login timestamps. No `legacyId`.                                           |
| `seasons`           | Year/name, scoring categories, roster slots, season/signing/draft dates, active and legacy-tie flags.                                               |
| `conferences`       | Conference identity, branding, abbreviation, and lead reporter.                                                                                     |
| `owners`            | Person, contact, amount owing, and active status. Email and owing are private to active users.                                                      |
| `franchises`        | Enduring team identity linked to one owner and conference; contains branding, reporter, and active status.                                          |
| `teams`             | Season-specific franchise instance with Yahoo ID and conference link.                                                                               |
| `players`           | Player identity, NHL/Yahoo identity, eligibility, ratings, salary, bio, current owner/team/lineup, and NHL contract snapshot.                       |
| `playerNhlSalaries` | Per-player/per-NHL-season salary and cap hit, league cap, normalized salary, and source provenance. Canonical key is `(playerId, seasonStartYear)`. |
| `nhlTeams`          | NHL team name, abbreviation, and logo lookup.                                                                                                       |

### Contracts, draft, and free agency

| Table            | Purpose and important relationships                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts`      | Player-owner contract signed in a season, with type, term, salary/cap hit, start/expiry dates, and statuses.                                                    |
| `draftPicks`     | Ordered season pick, current/original team, selected player, live clock timestamps, and trade/signing flags. Canonical live order is `(seasonId, round, pick)`. |
| `ufaOfferGroups` | One player/season competition, shared deadline, resolution state, winning offer, final odds/roll, and failure details.                                          |
| `ufaOffers`      | One franchise’s binding term/salary offer within a group, with owner/team references, factor snapshot, and pending/won/lost status.                             |

### Calendar and results

| Table      | Purpose and important relationships                                                            |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `weeks`    | Season week number/type, game-day count, date range, active/playoff flags.                     |
| `matchups` | Week and home/away teams, type, score/win/tie state, ranks, completion, and rating components. |
| `events`   | Dated, typed season event with optional description.                                           |

### Awards

| Table          | Purpose and important relationships                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awards`       | Legacy compatibility table whose winner and nominees are players. Generic adapters translate/split older mixed award data.                                             |
| `playerAwards` | Canonical player trophy and All-Star ownership by `(seasonId, playerId, award)`.                                                                                       |
| `teamAwards`   | Canonical owner-based team award. `ownerId` is authoritative; optional `teamId` remains only for online migration. Nominees may temporarily contain owner or team IDs. |

### Player statistics and archive

| Table                        | Grain and role                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `playerDayStatLines`         | Raw source at season/team/player/week/date grain, including lineup context and common stat fields.                                                                                                                       |
| `playerDayHighlights`        | Curated completed-season days retained after raw archive deletion, with source key/ID, rating/category ranks, reasons, and archive checksum. `sourcePlayerDayId` is a string because the source document may be deleted. |
| `seasonDataArchives`         | Archive manifest and state, source/aggregate checksums, row/date/highlight counts, activity snapshot, and backup metadata.                                                                                               |
| `playerWeekStatLines`        | Derived player totals per season/team/player/week.                                                                                                                                                                       |
| `playerSplitStatLines`       | Derived player totals per season/team/player/season type.                                                                                                                                                                |
| `playerTotalStatLines`       | Derived player totals per season/player/season type; may record multiple team IDs.                                                                                                                                       |
| `playerCareerSplitStatLines` | Derived career totals per team/player/season type.                                                                                                                                                                       |
| `playerCareerTotalStatLines` | Derived career totals per player/season type; may record multiple team IDs.                                                                                                                                              |
| `playerNhlStatLines`         | Authoritative NHL-season stat/rating/salary totals. Its `playerId` validator is currently a string, so the database does not enforce the player join.                                                                    |

### Team statistics

| Table                 | Grain and role                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `teamDayStatLines`    | Derived team category totals per season/team/week/date.                                                        |
| `teamWeekStatLines`   | Derived team week totals plus Elo, power, talent, GM, history, composite, and rank snapshots.                  |
| `teamSeasonStatLines` | Derived season/type/team totals, standings ranks, record fields, players used, power, and award ratings/ranks. |

### Publications

| Table                    | Purpose                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `weeklyEditions`         | Edition key/type/label, season/week, publication state, generation mode, validated content/facts, source hash, schedule, editor, homepage flag, and inactive article IDs. |
| `weeklyEditionRevisions` | Prior content, generation mode, source hash, timestamp, and editor captured before an edit or restore.                                                                    |

### Managed jobs

| Table           | Purpose                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `jobRuns`       | Durable job request, mode, status, lock scope, progress/cursor/result/error, pipeline ancestry, attempts, requester, and lifecycle timestamps. |
| `jobEvents`     | Bounded structured event log per run.                                                                                                          |
| `jobSchedules`  | Named interval schedule, job arguments, apply flag, enablement, and last/next run pointers.                                                    |
| `externalTasks` | Browser-worker payload, lease ownership/expiry, result chunks, and failure state.                                                              |
| `jobArtifacts`  | Convex storage object attached to a run with kind, name, and content type.                                                                     |

## Identifiers

- Convex `_id` is the canonical database identifier and foreign-key value.
- Public adapters commonly add `id: _id`; some responses also retain `_id` and `_creationTime`.
- `legacyId` preserves a Google Sheets or historical system identifier. It is not guaranteed to be globally unique.
- Generic imports strip incoming `_id`/`_creationTime` and, when appropriate, copy an external `id` into `legacyId`.
- Indexes accelerate lookup but do not themselves enforce uniqueness. Domain mutations and upsert functions must protect logical composite keys.
- Resolve a supplied ID as either a Convex ID or a legacy ID only at an explicit compatibility boundary. New relationships store typed Convex IDs.

## Timestamps and date keys

Canonical metadata is in [`convex/lib/timestamps.ts`](../../convex/lib/timestamps.ts).

- Storage target: Unix epoch milliseconds in UTC.
- The schema temporarily accepts legacy strings for configured timestamp fields during online backfill.
- Every generic storage boundary calls `normalizeTimestampFields`; invalid values fail rather than being silently preserved.
- Fields ending in `At` are instants. Domain fields such as `startDate`, `endDate`, `birthday`, and `expiryDate` are stored as UTC midnight timestamps and exposed as date-only values where appropriate.
- Only `playerDayStatLines.date` and `teamDayStatLines.date` are stable `YYYY-MM-DD` keys and must not be converted to instants.

When adding a timestamp field, update the schema and `UTC_TIMESTAMP_TABLE_FIELDS` together and add a focused normalization test.

## Stat values

Historical stat and rating columns accept number, string, or null. This is deliberate migration tolerance, not permission to create new mixed representations.

- Normalize to numbers for calculations.
- Preserve missing versus zero semantics.
- Never mutate source/query rows while aggregating.
- Keep the shared stat field vocabulary aligned across player and team grains.

## Data lifecycle

### Active and historical stats

```text
External source reconciliation
  → playerDayStatLines
  → playerWeekStatLines
  → playerSplitStatLines / playerTotalStatLines
  → playerCareerSplitStatLines / playerCareerTotalStatLines
  → teamDayStatLines / teamWeekStatLines / teamSeasonStatLines
  → ratings, power, standings, awards, publications
```

`playerDayStatLines` is authoritative for the league aggregation pipeline. Derived tables are rebuilt and compared by their documented composite keys. Stale derived rows should be reported and, on an approved apply run, removed unless the operator explicitly preserves them.

`playerNhlStatLines` is sourced from NHL/Hockey Reference season data and participates in ratings and UFA calculations. It is not derived solely from GSHL player days.

### Completed-season archive

The archive implementation spans [`convex/playerDayArchive.ts`](../../convex/playerDayArchive.ts), [`scripts/src/domains/maintenance/player-day-archive.ts`](../../scripts/src/domains/maintenance/player-day-archive.ts), and the local SQLite adapter.

```text
dry run
  → validate completed inactive season
  → canonical row checksum + aggregate parity + deterministic highlights

apply
  → local SQLite rows and manifest
  → portable gzip JSONL backup
  → Convex manifest: exporting
  → highlight upsert and stale-highlight removal
  → verified

optional confirmed deletion
  → verify source unchanged
  → full Convex snapshot ZIP
  → deleting
  → row-by-row canonical comparison and bounded deletion
  → archived

optional restore
  → conflict/checksum verification
  → bounded upsert
  → full logical checksum verification
  → restored
```

Active or unfinished seasons cannot be archived. Deletion requires an exact confirmed Convex season ID and can resume only with the matching local verified archive. `.local-data/` is gitignored; its SQLite database, gzip backups, and Convex snapshot ZIPs require an external retention policy.

When raw player days are archived, league activity reads the saved `activitySnapshot`; selected highlights remain queryable in Convex.

## Write rules

- Use explicit domain mutations for user actions so authorization and cross-table invariants stay atomic.
- Use `maintenanceScope` for bounded aggregate maintenance.
- Reserve `data.ts` for trusted migration/adaptation work; it can read or mutate arbitrary named tables.
- Default operator workflows to dry-run and require `--apply` for persistence.
- Review target deployment, counts, samples, conflicts, and deletions before applying.
- Do not directly patch protected draft clock/player fields; use `draft:submitPick` or `draft:undoPick`.
- Assign player ownership through `ownerId`; do not use `gshlTeamId` as the durable owner relationship.
- Store team awards by `ownerId`, not the transitional `teamId` field.
