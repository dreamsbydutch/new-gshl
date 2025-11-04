# Data Layer

Complete guide to GSHL's data architecture, Google Sheets integration, and the PlayerDay system.

---

## Table of Contents

- [Overview](#overview)
- [Google Sheets as Database](#google-sheets-as-database)
- [PlayerDay System](#playerday-system)
- [Data Aggregation Pipeline](#data-aggregation-pipeline)
- [Partitioning Strategy](#partitioning-strategy)
- [Sheets Adapter](#sheets-adapter)
- [Data Types](#data-types)
- [Performance Optimizations](#performance-optimizations)

---

## Overview

GSHL uses **Google Sheets as its primary database**, storing all league data across multiple sheets and workbooks. The system is optimized for:

- ✅ Manual data entry and corrections by league admins
- ✅ Collaborative editing with audit history
- ✅ No database hosting costs
- ✅ Familiar spreadsheet interface
- ✅ Handling 251,000+ PlayerDay records via partitioning

### Core Entities

| Entity          | Sheet(s)                        | Description                         |
| --------------- | ------------------------------- | ----------------------------------- |
| **Teams**       | Teams                           | 15 fantasy teams across all seasons |
| **Players**     | Players                         | NHL players tracked by the league   |
| **Contracts**   | Contracts                       | Player contracts and salary cap     |
| **DraftPicks**  | DraftPicks                      | Draft picks owned by teams          |
| **Schedules**   | Schedule                        | Team matchups by week               |
| **PlayerDay**   | PlayerDayStatLine (3 workbooks) | Daily player statistics             |
| **PlayerWeek**  | PlayerWeekStatLine              | Weekly aggregated stats             |
| **PlayerSplit** | PlayerSplitStatLine             | Stats by season type (RS, PO, LT)   |
| **PlayerTotal** | PlayerTotalStatLine             | Full season totals                  |

---

## Google Sheets as Database

### Main Workbook

**Spreadsheet ID**: `SPREADSHEET_ID_MAIN` (from `.env`)

Contains all league entities except daily player stats:

```
Sheets in Main Workbook:
├── Teams                    # Fantasy teams
├── Players                  # NHL players
├── Contracts                # Player contracts
├── DraftPicks               # Draft picks
├── Schedule                 # Team matchups
├── PlayerWeekStatLine       # Weekly stats
├── PlayerSplitStatLine      # Season type stats
├── PlayerTotalStatLine      # Season totals
├── TeamDayStatLine          # Team daily stats
├── TeamWeekStatLine         # Team weekly stats
├── Seasons                  # Season metadata
├── Weeks                    # Week definitions
├── Franchises               # Team franchise history
├── Owners                   # Team owners
└── ... (and more)
```

### PlayerDay Partitioned Workbooks

Due to Google Sheets 5M cell limit, PlayerDay records are partitioned across **3 separate workbooks**:

| Workbook            | Seasons | Records | Spreadsheet ID Env Var             |
| ------------------- | ------- | ------- | ---------------------------------- |
| **PlayerDays_1-5**  | 1-5     | ~63,000 | `SPREADSHEET_ID_PLAYERDAY_1_5`     |
| **PlayerDays_6-10** | 6-10    | ~94,000 | `SPREADSHEET_ID_PLAYERDAY_6_10`    |
| **PlayerDays_11+**  | 11-15   | ~94,000 | `SPREADSHEET_ID_PLAYERDAY_11_PLUS` |

Each workbook contains a single sheet: `PlayerDayStatLine`

---

## PlayerDay System

### What is PlayerDay?

A **PlayerDay record** represents a single player's statistics for one calendar date. It's the atomic unit of player tracking in GSHL.

### Schema

```typescript
interface PlayerDayStatLine {
  // Identity
  playerId: string; // NHL player ID
  gshlTeamId: string; // Fantasy team ID
  seasonId: string; // Season number (1-15)
  weekId: string; // Week ID or date
  date: string; // YYYY-MM-DD

  // Position & Status
  nhlPos: string; // Position(s): "C,LW" or "D"
  posGroup: string; // F, D, or G
  dailyPos: string; // Assigned position for day
  fullPos?: string; // Actual position filled (optimizer)
  bestPos?: string; // Optimal position (optimizer)

  // Games
  GP: number; // Games played (0 or 1)
  GS: number; // Games started (0 or 1)

  // Scoring Stats (Forwards/Defense)
  G: number; // Goals
  A1: number; // Primary assists
  A2: number; // Secondary assists
  PTS: number; // Points (G + A1 + A2)
  PPG: number; // Power play goals
  PPA: number; // Power play assists
  SHG: number; // Short-handed goals
  SHA: number; // Short-handed assists
  SOG: number; // Shots on goal
  BLK: number; // Blocks
  HIT: number; // Hits
  TK: number; // Takeaways
  GV: number; // Giveaways
  PIM: number; // Penalty minutes

  // Goalie Stats
  GA: number; // Goals against
  SV: number; // Saves
  SO: number; // Shutouts (0 or 1)

  // Calculated
  Rating: number; // Player rating (0-100 scale)

  // Lineup Tracking
  MS?: number; // Missed start (should have started)
  BS?: number; // Bad start (shouldn't have started)
  ADD?: number; // Added to roster (1 if new)

  // Metadata
  IR: number; // Injured reserve (0 or 1)
  IRplus: number; // IR+ (0 or 1)
}
```

### Data Flow

```
Yahoo Fantasy Daily Stats
         ↓
   Yahoo Scraper (Puppeteer)
         ↓
   Upsert to PlayerDayStatLine
         ↓
   Stat Aggregation Pipeline
         ↓
   PlayerWeek → PlayerSplit → PlayerTotal
         ↓
   Lineup Optimizer (optional)
         ↓
   fullPos, bestPos, MS, BS updated
```

### Upsert Logic

When syncing from Yahoo, the system **upserts** (update or insert) based on composite key:

```typescript
const key = `${playerId}|${gshlTeamId}|${date}`;
```

- **If exists**: Update stats (G, A, SOG, etc.)
- **If new**: Insert new row

This prevents duplicate records and allows re-syncing corrected data.

---

## Data Aggregation Pipeline

### Overview

Daily stats (PlayerDay) are aggregated into higher-level summaries:

```
PlayerDayStatLine (251K+ records)
       ↓
PlayerWeekStatLine (~18K records)
       ↓
PlayerSplitStatLine (~5K records)
       ↓
PlayerTotalStatLine (~1.5K records)
```

### Aggregation Levels

#### 1. PlayerWeek (Weekly Totals)

Groups PlayerDay by `playerId + gshlTeamId + weekId`.

```typescript
// Example: Player #123 on Team A in Week 15
PlayerWeek = SUM of all PlayerDay records where:
  - playerId = "123"
  - gshlTeamId = "A"
  - weekId = "15"
```

**Calculated Fields**:

- `GP`: Count of days with GP > 0
- `GS`: Count of days with GS > 0
- `G`, `A1`, `A2`, etc.: Sum across all days
- `Rating`: Average rating across days played

#### 2. PlayerSplit (Season Type Totals)

Groups PlayerWeek by `playerId + gshlTeamId + seasonId + seasonType`.

**Season Types**:

- **RS**: Regular Season
- **PO**: Playoffs
- **LT**: Losers Tournament (consolation bracket)

```typescript
// Example: Player #123 on Team A in Season 7 Regular Season
PlayerSplit = SUM of all PlayerWeek records where:
  - playerId = "123"
  - gshlTeamId = "A"
  - seasonId = "7"
  - seasonType = "RS"
```

#### 3. PlayerTotal (Full Season Totals)

Groups PlayerSplit by `playerId + gshlTeamId + seasonId`.

```typescript
// Example: Player #123 on Team A in Season 7 (all types combined)
PlayerTotal = SUM of all PlayerSplit records where:
  - playerId = "123"
  - gshlTeamId = "A"
  - seasonId = "7"
```

### Aggregation Scripts

Run via npm scripts:

```bash
# Aggregate all levels
npm run stats:aggregate-all

# Individual levels
npm run stats:aggregate-week
npm run stats:aggregate-split
npm run stats:aggregate-total
```

See [Scripts & Utilities](./SCRIPTS.md) for implementation details.

---

## Partitioning Strategy

### Why Partition?

Google Sheets has a **5 million cell limit** per workbook. With 251,000+ PlayerDay records and ~40 columns each:

```
251,000 rows × 40 columns = 10,040,000 cells
```

This exceeds the limit, requiring partitioning.

### Partitioning Logic

PlayerDay records are distributed by **seasonId**:

```typescript
function getWorkbookForSeason(seasonId: number): string {
  if (seasonId >= 1 && seasonId <= 5) {
    return SPREADSHEET_ID_PLAYERDAY_1_5;
  }
  if (seasonId >= 6 && seasonId <= 10) {
    return SPREADSHEET_ID_PLAYERDAY_6_10;
  }
  return SPREADSHEET_ID_PLAYERDAY_11_PLUS; // 11-15+
}
```

### Querying Across Partitions

When fetching PlayerDay data for unknown seasons, query all workbooks:

```typescript
async function getAllPlayerDays() {
  const workbooks = [
    SPREADSHEET_ID_PLAYERDAY_1_5,
    SPREADSHEET_ID_PLAYERDAY_6_10,
    SPREADSHEET_ID_PLAYERDAY_11_PLUS,
  ];

  const results = await Promise.all(
    workbooks.map((id) => fetchFromWorkbook(id)),
  );

  return results.flat();
}
```

### Partition Maintenance

**Adding a new partition** (e.g., for seasons 16-20):

1. Create new Google Sheet workbook
2. Add sheet named `PlayerDayStatLine` with same column headers
3. Share with service account
4. Add `SPREADSHEET_ID_PLAYERDAY_16_20` to `.env`
5. Update partitioning logic in code
6. Update migration scripts

---

## Sheets Adapter

### Location

`src/lib/sheets/index.ts`

### Purpose

The Sheets Adapter provides a typed interface to Google Sheets API, abstracting:

- Authentication via service account
- Batch read/write operations
- Row-to-object mapping
- Error handling

### Basic Usage

```typescript
import { getGoogleSheetsClient } from "@/lib/sheets";

// Get authenticated client
const sheets = await getGoogleSheetsClient();

// Read data
const response = await sheets.spreadsheets.values.get({
  spreadsheetId: SPREADSHEET_ID_MAIN,
  range: "Teams!A:Z",
});

const rows = response.data.values;
const headers = rows[0];
const dataRows = rows.slice(1);

// Map to objects
const teams = dataRows.map((row) => ({
  teamId: row[0],
  teamName: row[1],
  ownerId: row[2],
  // ...
}));
```

### Batch Operations

For performance, batch multiple reads:

```typescript
const response = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: SPREADSHEET_ID_MAIN,
  ranges: ["Teams!A:Z", "Players!A:Z", "Contracts!A:Z"],
});

const [teamsData, playersData, contractsData] = response.data.valueRanges;
```

### Write Operations

```typescript
// Update single cell
await sheets.spreadsheets.values.update({
  spreadsheetId: SPREADSHEET_ID_MAIN,
  range: "Teams!B2",
  valueInputOption: "RAW",
  requestBody: {
    values: [["New Team Name"]],
  },
});

// Batch update
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SPREADSHEET_ID_MAIN,
  requestBody: {
    data: [
      {
        range: "PlayerDayStatLine!F2:G2",
        values: [["LW", "RW"]], // fullPos, bestPos
      },
    ],
    valueInputOption: "RAW",
  },
});
```

### Rate Limiting

Google Sheets API limits: **500 requests per 100 seconds**

**Mitigations**:

- Batch operations reduce request count
- TRPC query cache (30s stale time) reduces redundant fetches
- Scripts use delays between bulk operations

---

## Data Types

### Core Enums

```typescript
// src/lib/types/enums.ts

export enum RosterPosition {
  LW = "LW",
  C = "C",
  RW = "RW",
  D = "D",
  G = "G",
  Util = "Util",
  BN = "BN", // Bench
  IR = "IR", // Injured Reserve
  IRplus = "IR+", // IR+
  NA = "N/A", // Not available
}

export enum PositionGroup {
  F = "F", // Forward
  D = "D", // Defense
  G = "G", // Goalie
}

export enum SeasonType {
  RS = "RS", // Regular Season
  PO = "PO", // Playoffs
  LT = "LT", // Losers Tournament
}
```

### Domain Interfaces

```typescript
// src/lib/types/player.ts

export interface Player {
  playerId: string;
  firstName: string;
  lastName: string;
  nhlPos: RosterPosition[];
  posGroup: PositionGroup;
  nhlTeamId: string;
}

export interface Team {
  gshlTeamId: string;
  teamName: string;
  ownerId: string;
  franchiseId: string;
  seasonId: string;
}

export interface Contract {
  contractId: string;
  playerId: string;
  gshlTeamId: string;
  seasonId: string;
  capHit: number;
  yearsRemaining: number;
  expiryYear: number;
}
```

See [TypeScript Types](./TYPES.md) for complete type reference.

---

## Performance Optimizations

### 1. Query Caching

TRPC queries are cached via TanStack Query:

```typescript
// src/trpc/query-client.ts
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    },
  });
}
```

This reduces Google Sheets API calls by serving cached data for 30 seconds.

### 2. Batch Reads

Always batch multiple sheet reads into single API call:

```typescript
// ❌ BAD: 3 API calls
const teams = await getTeams();
const players = await getPlayers();
const contracts = await getContracts();

// ✅ GOOD: 1 API call
const [teams, players, contracts] = await Promise.all([
  getTeams(),
  getPlayers(),
  getContracts(),
]);
```

### 3. Selective Column Fetching

Only fetch needed columns:

```typescript
// ❌ BAD: Fetches all columns
range: "Teams!A:ZZ";

// ✅ GOOD: Only needed columns
range: "Teams!A:F"; // teamId, teamName, ownerId, franchiseId, seasonId, conference
```

### 4. Server-Side Filtering

Filter data server-side before sending to client:

```typescript
// TRPC procedure
export const teamRouter = createTRPCRouter({
  getByOwner: publicProcedure
    .input(z.object({ ownerId: z.string() }))
    .query(async ({ input }) => {
      const allTeams = await fetchTeams();
      // Filter on server
      return allTeams.filter((t) => t.ownerId === input.ownerId);
    }),
});
```

### 5. Pagination (Future)

For very large datasets, implement pagination:

```typescript
export const playerRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(100),
      }),
    )
    .query(async ({ input }) => {
      const allPlayers = await fetchPlayers();
      const start = (input.page - 1) * input.limit;
      const end = start + input.limit;
      return {
        data: allPlayers.slice(start, end),
        total: allPlayers.length,
        page: input.page,
      };
    }),
});
```

---

## Next Steps

To dive deeper:

- **[Database Schema](./SCHEMA.md)** - Complete sheet structure and columns
- **[TRPC API](./TRPC_API.md)** - How to query data from components
- **[Scripts & Utilities](./SCRIPTS.md)** - Data maintenance scripts
- **[Lineup Optimizer](./LINEUP_OPTIMIZER.md)** - How fullPos/bestPos are calculated

---

_For questions about data flow, see [Architecture Overview](./ARCHITECTURE.md)_
