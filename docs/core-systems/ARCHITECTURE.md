# Architecture Overview

Comprehensive system architecture for the GSHL fantasy hockey league management application.

---

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Architecture Layers](#architecture-layers)
- [Data Flow](#data-flow)
- [Folder Structure](#folder-structure)
- [Design Patterns](#design-patterns)
- [Performance Considerations](#performance-considerations)

---

## System Overview

GSHL is a **server-side rendered** fantasy hockey management platform built with Next.js App Router that uses **Google Sheets as the database** and **Yahoo Fantasy as the data source**.

### Key Characteristics

- **Type-safe** end-to-end with TypeScript + TRPC
- **Prop-driven** React components (no fetching in UI layers)
- **Cached queries** with 30-second stale time via TRPC/TanStack Query
- **Automated data sync** via Vercel Cron jobs
- **Partitioned database** across 3 Google Sheets workbooks for performance
- **No traditional ORM** - direct Google Sheets API via optimized adapter

---

## Technology Stack

### Frontend

| Technology       | Version | Purpose                         |
| ---------------- | ------- | ------------------------------- |
| **Next.js**      | 15.0.1  | React framework with App Router |
| **React**        | 18.3.1  | UI library                      |
| **TypeScript**   | ^5      | Type safety                     |
| **Tailwind CSS** | ^3      | Utility-first styling           |
| **shadcn/ui**    | Latest  | Component primitives (Radix UI) |

### Backend

| Technology            | Version       | Purpose                                |
| --------------------- | ------------- | -------------------------------------- |
| **TRPC**              | 11.0.0-rc.446 | Type-safe API layer                    |
| **TanStack Query**    | 5.80.7        | Data fetching & caching                |
| **SuperJSON**         | 2.2.1         | Serialization (Date, Map, Set support) |
| **Google Sheets API** | Latest        | Database layer                         |
| **Yahoo Fantasy API** | Scraper       | Stats data source                      |

### State Management

| Technology           | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| **Zustand**          | Persisted navigation state (season, team, owner filters) |
| **TRPC Query Cache** | Server state (30s stale, automatic revalidation)         |
| **React Context**    | Minimal use for theme/toast providers                    |

### Deployment & Automation

| Technology      | Purpose                                                 |
| --------------- | ------------------------------------------------------- |
| **Vercel**      | Hosting, Edge Functions, Serverless Functions           |
| **Vercel Cron** | Scheduled tasks (daily stats sync, weekly aggregations) |
| **Puppeteer**   | Yahoo Fantasy scraper (headless browser)                |

---

## Architecture Layers

### Layer 1: Presentation (Client Components)

**Location**: `src/app/**/page.tsx` + `src/components/**/main.tsx`

**Responsibilities**:

- Render UI based on props
- Handle user interactions
- Show loading skeletons until data ready
- NO data fetching (delegates to hooks)

**Pattern**:

```tsx
// src/app/lockerroom/page.tsx
"use client";
import { TeamRoster } from "@gshl-components/team/TeamRoster";
import { useTeam } from "@gshl-hooks";

export default function LockerRoomPage() {
  const { team, roster, ready } = useTeam();
  if (!ready) return <Skeleton />;
  return <TeamRoster team={team} roster={roster} />;
}
```

### Layer 2: Data Composition (Custom Hooks)

**Location**: `src/lib/hooks/**/*.ts`

**Responsibilities**:

- Fetch data via TRPC hooks
- Compose multiple queries into view models
- Normalize data (e.g., convert date strings to Date objects)
- Expose `ready` flags for skeleton logic

**Pattern**:

```typescript
// src/lib/hooks/data/useTeam.ts
import { api } from "@/trpc/react";

export function useTeam() {
  const { data: team } = api.team.getByOwner.useQuery();
  const { data: roster } = api.player.getRoster.useQuery();

  const ready = Boolean(team && roster);
  return { team, roster, ready };
}
```

### Layer 3: API Layer (TRPC Routers)

**Location**: `src/server/api/routers/*.ts`

**Responsibilities**:

- Define type-safe procedures (queries & mutations)
- Call Google Sheets adapter
- Return domain objects (Players, Teams, Contracts, etc.)

**Pattern**:

```typescript
// src/server/api/routers/team.ts
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";

export const teamRouter = createTRPCRouter({
  getByOwner: publicProcedure
    .input(z.object({ ownerId: z.string() }))
    .query(async ({ input }) => {
      const sheets = getOptimizedSheetsAdapter();
      return sheets.getTeamsByOwner(input.ownerId);
    }),
});
```

### Layer 4: Data Access (Sheets Adapter)

**Location**: `src/lib/sheets/optimizedSheetsAdapter.ts`

**Responsibilities**:

- Read from Google Sheets API
- Write to Google Sheets API
- Batch operations for performance
- Handle partitioning across workbooks

**Pattern**:

```typescript
// Simplified example
export class OptimizedSheetsAdapter {
  async getTeamsByOwner(ownerId: string) {
    const rows = await this.sheets.getRows("Teams!A:Z");
    return rows.filter((row) => row.ownerId === ownerId);
  }
}
```

### Layer 5: Database (Google Sheets)

**Structure**:

- **1 Main Workbook**: Teams, Contracts, DraftPicks, Schedules, etc.
- **3 PlayerDay Workbooks**: Partitioned by season (1-5, 6-10, 11+)

**Why Google Sheets?**

- ✅ Familiar spreadsheet interface for league admins
- ✅ Manual data entry and corrections
- ✅ No database hosting costs
- ✅ Built-in collaboration and audit trail
- ❌ Limited to ~5M cells per workbook (mitigated via partitioning)
- ❌ API rate limits (mitigated via caching)

---

## Data Flow

### Query Flow (Read Path)

```
User visits page
       ↓
Next.js renders skeleton
       ↓
Client component mounts
       ↓
Custom hook calls api.*.*.useQuery()
       ↓
TRPC Client sends request
       ↓
TRPC Server procedure executes
       ↓
Google Sheets Adapter fetches data
       ↓
Google Sheets API returns rows
       ↓
Adapter transforms to domain objects
       ↓
TRPC returns typed data
       ↓
TanStack Query caches result (30s stale)
       ↓
Hook returns { data, ready: true }
       ↓
Component renders UI
```

### Mutation Flow (Write Path)

```
User clicks button (e.g., "Update Contract")
       ↓
Component calls mutation.mutate({ ... })
       ↓
TRPC Client sends mutation request
       ↓
TRPC Server mutation procedure executes
       ↓
Google Sheets Adapter updates row
       ↓
Google Sheets API confirms write
       ↓
TRPC invalidates affected queries
       ↓
TanStack Query refetches automatically
       ↓
UI updates with fresh data
```

### Cron Job Flow (Automation)

```
Vercel Cron triggers (e.g., daily at 3 AM EST)
       ↓
Next.js API route /api/cron/sync-stats
       ↓
Yahoo Scraper launches Puppeteer
       ↓
Scraper logs into Yahoo Fantasy
       ↓
Scraper extracts player stats for date
       ↓
Scraper upserts PlayerDay records to Sheets
       ↓
Stat Aggregation script runs
       ↓
PlayerWeek, PlayerSplit, PlayerTotal updated
       ↓
Lineup Optimizer runs (optional)
       ↓
fullPos and bestPos calculated
       ↓
Cron job completes
```

---

## Folder Structure

```
new-gshl/
├── src/
│   ├── app/                      # Next.js App Router pages
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Home page (admin tools)
│   │   ├── standings/page.tsx    # Standings page
│   │   ├── schedule/page.tsx     # Schedule page
│   │   ├── lockerroom/page.tsx   # Team locker room
│   │   ├── draftboard/page.tsx   # Draft board
│   │   ├── leagueoffice/page.tsx # League office (contracts)
│   │   └── api/                  # API routes (cron, cache, etc.)
│   │
│   ├── components/               # Feature components (domain-based)
│   │   ├── admin/                # Admin tools (single files)
│   │   │   ├── YahooScraperControl.tsx
│   │   │   ├── LeagueStatsUpdater.tsx
│   │   │   └── index.ts          # Barrel export
│   │   ├── team/                 # Team components
│   │   │   ├── TeamRoster/
│   │   │   │   ├── main.tsx      # Main component
│   │   │   │   └── components/   # Sub-components (optional)
│   │   │   ├── TeamSchedule/main.tsx
│   │   │   └── TeamHistory/main.tsx
│   │   ├── draft/                # Draft features
│   │   │   ├── DraftBoardList/main.tsx
│   │   │   └── DraftAdminList/main.tsx
│   │   ├── contracts/            # Contract features
│   │   │   ├── ContractTable/main.tsx
│   │   │   └── FreeAgencyList/main.tsx
│   │   ├── league/               # League features
│   │   │   ├── StandingsContainer/main.tsx
│   │   │   └── WeeklySchedule/main.tsx
│   │   ├── skeletons/            # Loading skeletons
│   │   │   ├── TeamRosterSkeleton.tsx
│   │   │   └── index.ts
│   │   └── ui/                   # Primitives (single files)
│   │       ├── button.tsx
│   │       ├── dropdown-menu.tsx
│   │       └── index.ts
│   │
│   ├── lib/                      # Shared libraries
│   │   ├── hooks/                # ALL custom React hooks
│   │   │   ├── index.ts          # Barrel export
│   │   │   ├── data/             # Data hooks (useTeam, usePlayers, etc.)
│   │   │   ├── features/         # Feature hooks (useTeamRosterData, etc.)
│   │   │   ├── state/            # State hooks (useNavSelections, etc.)
│   │   │   └── utils/            # Hook utilities
│   │   ├── sheets/               # Google Sheets adapter
│   │   ├── types/                # Domain type definitions
│   │   ├── utils/                # ALL utility functions
│   │   │   ├── index.ts          # Barrel export
│   │   │   ├── formatters.ts     # Date, currency, etc.
│   │   │   ├── filters.ts        # Array filtering
│   │   │   ├── sorters.ts        # Array sorting
│   │   │   ├── season-helpers.ts # Season logic
│   │   │   ├── domain/           # Domain-specific logic
│   │   │   └── ranking/          # Player ranking engine
│   │   ├── yahoo/                # Yahoo scraper
│   │   └── cache/                # Zustand store
│   │
│   ├── server/                   # Server-only code
│   │   ├── api/                  # TRPC routers and procedures
│   │   │   ├── routers/          # Individual routers
│   │   │   ├── root.ts           # Router composition
│   │   │   └── trpc.ts           # TRPC context and middleware
│   │   ├── cron/                 # Cron job implementations
│   │   │   ├── manager.ts        # Cron manager
│   │   │   ├── jobs.ts           # Job registrations
│   │   │   └── tasks/            # Task implementations
│   │   ├── scrapers/             # Yahoo scraper utilities
│   │   └── scripts/              # Maintenance scripts
│   │
│   ├── trpc/                     # TRPC client setup
│   │   ├── index.ts              # Client exports
│   │   ├── react.tsx             # Client-side TRPC provider
│   │   ├── server.ts             # Server-side TRPC caller
│   │   ├── server-exports.ts     # Server-only exports
│   │   └── query-client.ts       # TanStack Query configuration
│   │
│   ├── styles/
│   │   └── globals.css           # Global styles + Tailwind imports
│   │
│   └── env.js                    # Environment variable validation
│
├── docs/                         # Documentation (you are here)
├── public/                       # Static assets
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.ts            # Tailwind CSS configuration
└── next.config.js                # Next.js configuration
```

### Path Aliases

Defined in `tsconfig.json`:

```json
{
  "paths": {
    "@/*": ["./src/*"],
    "@gshl-components/*": ["./src/components/*/main"],
    "@gshl-hooks": ["./src/lib/hooks"],
    "@gshl-ui": ["./src/components/ui"],
    "@gshl-utils": ["./src/lib/utils"],
    "@gshl-types": ["./src/lib/types"],
    "@gshl-skeletons": ["./src/components/skeletons"]
  }
}
```

**Usage**:

```typescript
import { TeamRoster } from "@gshl-components/team/TeamRoster";
import { useTeam } from "@gshl-hooks";
import { Button } from "@gshl-ui";
import { formatDate } from "@gshl-utils";
```

---

## Design Patterns

### 1. Single-File Component Pattern

Each component is a single file with related logic separated:

```
src/
├── components/
│   └── team/
│       └── TeamRoster/
│           ├── main.tsx              # Main component
│           └── components/           # Optional sub-components
│               ├── index.ts
│               ├── RosterLineup.tsx
│               └── BenchPlayers.tsx
├── lib/
│   ├── hooks/
│   │   └── features/
│   │       └── useTeamRosterData.ts  # Component hook
│   └── utils/
│       └── roster-helpers.ts         # Utility functions
```

**Why?**

- ✅ Single file per component (clean, simple)
- ✅ Hooks centralized in `lib/hooks` (reusable across components)
- ✅ Utils centralized in `lib/utils` (no duplication)
- ✅ Clear separation of concerns
- ✅ Easy to test in isolation

### 2. Prop-Driven Components

Components NEVER fetch data directly. Data flows in via props.

**Why?**

- ✅ Easier to test (pass mock props)
- ✅ Reusable across contexts
- ✅ Clear data dependencies
- ✅ Simplified reasoning about component behavior

### 3. Readiness Pattern

Hooks expose a `ready` boolean; components show skeletons until true.

```typescript
export function useTeam() {
  const { data: team } = api.team.get.useQuery();
  const { data: roster } = api.player.getRoster.useQuery();

  const ready = Boolean(team && roster);
  return { team, roster, ready };
}
```

```tsx
export function TeamRoster() {
  const { team, roster, ready } = useTeam();
  if (!ready) return <TeamRosterSkeleton />;
  return <div>{/* render */}</div>;
}
```

### 4. Immutable Data Transformations

Never mutate props or query results. Always clone before transforming.

```typescript
// ❌ BAD - mutates original array
const sorted = contracts.sort((a, b) => ...);

// ✅ GOOD - creates new array
const sorted = [...contracts].sort((a, b) => ...);
```

### 5. Barrel Exports

Use `index.ts` to re-export public API of folders.

```typescript
// src/components/ui/index.ts
export { Button } from "./button";
export { DropdownMenu } from "./dropdown-menu";
```

### 6. Server-Only Imports

Mark server code with `import "server-only"` to prevent client bundling.

```typescript
// src/server/api/routers/team.ts
import "server-only";
import { createTRPCRouter } from "../trpc";
```

---

## Performance Considerations

### 1. Google Sheets API Rate Limits

- **Quota**: 500 requests per 100 seconds per project
- **Mitigation**:
  - Batch reads via `sheets.batchGet()`
  - 30-second stale time on TRPC queries
  - Avoid refetch on window focus

### 2. PlayerDay Partitioning

251,000+ PlayerDay records split across 3 workbooks:

- **Workbook 1**: Seasons 1-5
- **Workbook 2**: Seasons 6-10
- **Workbook 3**: Seasons 11+

**Why?**

- Google Sheets limits 5M cells per workbook
- Partitioning keeps workbooks under 2M cells
- Queries target specific workbook by season

### 3. Query Caching

TanStack Query caches with:

- **Stale time**: 30 seconds
- **GC time**: 5 minutes
- **Refetch on window focus**: Disabled
- **Persistence**: Optional via `query-persistence.ts`

### 4. Lineup Optimizer Performance

Backtracking algorithm can be O(n!) for large rosters.

**Optimizations**:

- 5-second timeout per lineup (typical runtime: 1-3s for 15-17 players)
- Garbage collection every 50 lineups
- Node.js heap increased to 4GB: `--max-old-space-size=4096`

### 5. Next.js Production Build

```bash
npm run build
```

Generates optimized bundle:

- Route-based code splitting
- Image optimization
- Font optimization
- CSS minification

---

## Security Considerations

### 1. Google Service Account

- Private key stored in environment variable
- Service account has Editor access to Sheets
- No user authentication required

### 2. Yahoo Credentials

- Yahoo login stored in environment variables
- Credentials never exposed to client
- Scraper runs server-side only

### 3. TRPC Public Procedures

Currently all procedures are public (no auth middleware).

**Future**: Add auth middleware for mutations:

```typescript
const protectedProcedure = publicProcedure.use(({ next, ctx }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next();
});
```

### 4. Environment Variables

Validated at build time via `src/env.js` (T3 Env pattern).

Missing required vars = build fails.

---

## Scalability Considerations

### Current Limits

- **Google Sheets**: ~5M cells per workbook (handled via partitioning)
- **Vercel Functions**: 10-second timeout (Edge), 60-second (Serverless)
- **TRPC Payload**: Max ~6MB per response (rare issue)

### Future Database Migration

If Google Sheets becomes limiting:

**Option 1**: PostgreSQL (e.g., Supabase, PlanetScale)

- Replace sheets adapter with Prisma ORM
- Keep TRPC layer unchanged
- Migrate data via export/import scripts

**Option 2**: MongoDB

- Replace sheets adapter with Mongoose
- Keep TRPC layer unchanged
- Better for nested documents (e.g., PlayerDay records)

**Option 3**: Hybrid

- Keep Teams, Contracts, DraftPicks in Sheets (manual editing)
- Move PlayerDay to PostgreSQL/MongoDB (massive scale)

---

## Next Steps

To dive deeper:

- **[Data Layer](./DATA_LAYER.md)** - Learn about PlayerDay system and aggregations
- **[TRPC API](./TRPC_API.md)** - Explore router structure and procedures
- **[Component Architecture](./COMPONENTS.md)** - Build UI features
- **[Development Setup](./DEVELOPMENT.md)** - Configure local environment

---

_For questions or clarifications, see [Troubleshooting](./TROUBLESHOOTING.md)_
