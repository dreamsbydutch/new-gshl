# TRPC API

Complete reference for the GSHL TRPC API layer, including all routers, procedures, and usage patterns.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Available Routers](#available-routers)
- [Common Patterns](#common-patterns)
- [Usage Examples](#usage-examples)
- [Creating New Procedures](#creating-new-procedures)
- [Error Handling](#error-handling)

---

## Overview

GSHL uses **TRPC 11** for end-to-end type-safe APIs. TRPC provides:

- ✅ Full TypeScript type inference from server to client
- ✅ No code generation required
- ✅ Automatic input validation with Zod
- ✅ Integrated with TanStack Query for caching
- ✅ SuperJSON serialization (Date, Map, Set support)

---

## Architecture

### Request Flow

```
React Component
       ↓
api.router.procedure.useQuery()  ← TRPC Client Hook
       ↓
HTTP Request to /api/trpc/[trpc]
       ↓
TRPC Server Handler
       ↓
Router Procedure
       ↓
Google Sheets Adapter
       ↓
Google Sheets API
       ↓
Response (typed data)
       ↓
TanStack Query Cache
       ↓
React Component Re-renders
```

### File Structure

```
src/
├── server/api/
│   ├── root.ts              # App router composition
│   ├── trpc.ts              # TRPC context & procedures
│   └── routers/             # Individual routers
│       ├── season.ts
│       ├── team.ts
│       ├── player.ts
│       └── ... (17 routers)
│
├── trpc/
│   ├── react.tsx            # Client-side setup
│   ├── server.ts            # Server-side caller
│   └── query-client.ts      # TanStack Query config
```

---

## Available Routers

### Core Entity Routers

| Router         | File            | Purpose                           |
| -------------- | --------------- | --------------------------------- |
| **season**     | `season.ts`     | Season metadata and configuration |
| **week**       | `week.ts`       | Week definitions and date ranges  |
| **team**       | `team.ts`       | Fantasy teams                     |
| **player**     | `player.ts`     | NHL players                       |
| **conference** | `conference.ts` | League conferences                |
| **franchise**  | `franchise.ts`  | Team franchise history            |

### Management Routers

| Router        | File           | Purpose                     |
| ------------- | -------------- | --------------------------- |
| **owner**     | `owner.ts`     | Team owners                 |
| **matchup**   | `matchup.ts`   | Team matchups and schedules |
| **event**     | `event.ts`     | League events               |
| **contract**  | `contract.ts`  | Player contracts            |
| **draftPick** | `draftPick.ts` | Draft picks                 |

### Statistics Routers

| Router              | File                 | Purpose                                  |
| ------------------- | -------------------- | ---------------------------------------- |
| **playerStats**     | `playerStats.ts`     | Player statistics (Day/Week/Split/Total) |
| **teamStats**       | `teamStats.ts`       | Team statistics                          |
| **statAggregation** | `statAggregation.ts` | Stat aggregation utilities               |

### System Routers

| Router           | File               | Purpose                            |
| ---------------- | ------------------ | ---------------------------------- |
| **system**       | `system.ts`        | System utilities and health checks |
| **yahooScraper** | `yahoo-scraper.ts` | Yahoo Fantasy data sync            |

---

## Common Patterns

### Query Procedures

**Queries** fetch data without side effects:

```typescript
// src/server/api/routers/team.ts
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";

export const teamRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    // Fetch all teams from Google Sheets
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID_MAIN,
      range: "Teams!A:Z",
    });

    return parseTeamsFromRows(response.data.values);
  }),

  getById: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input }) => {
      const teams = await fetchAllTeams();
      return teams.find((t) => t.gshlTeamId === input.teamId);
    }),
});
```

### Mutation Procedures

**Mutations** modify data:

```typescript
export const contractRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        playerId: z.string(),
        gshlTeamId: z.string(),
        capHit: z.number(),
        years: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const sheets = await getGoogleSheetsClient();

      // Append new row to Contracts sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID_MAIN,
        range: "Contracts!A:Z",
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              generateContractId(),
              input.playerId,
              input.gshlTeamId,
              input.capHit,
              input.years,
              // ...
            ],
          ],
        },
      });

      return { success: true };
    }),
});
```

### Input Validation

Use **Zod** for runtime validation:

```typescript
const playerInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nhlPos: z.array(z.enum(["LW", "C", "RW", "D", "G"])),
  nhlTeamId: z.string(),
});

export const playerRouter = createTRPCRouter({
  create: publicProcedure
    .input(playerInputSchema)
    .mutation(async ({ input }) => {
      // input is fully typed and validated
      console.log(input.firstName); // TypeScript knows this is a string
      // ...
    }),
});
```

---

## Usage Examples

### Client-Side Queries

```typescript
// src/app/standings/page.tsx
"use client";

import { api } from "@/trpc/react";

export default function StandingsPage() {
  // Query with no input
  const { data: seasons, isLoading } = api.season.getAll.useQuery();

  // Query with input
  const { data: team } = api.team.getById.useQuery({
    teamId: "A",
  });

  // Conditional query (only runs if teamId exists)
  const [teamId, setTeamId] = useState<string | null>(null);
  const { data: roster } = api.player.getRoster.useQuery(
    { teamId: teamId! },
    { enabled: Boolean(teamId) }
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {seasons?.map(season => (
        <div key={season.seasonId}>{season.seasonName}</div>
      ))}
    </div>
  );
}
```

### Client-Side Mutations

```typescript
"use client";

import { api } from "@/trpc/react";

export function ContractForm() {
  const utils = api.useUtils();

  // Define mutation
  const createContract = api.contract.create.useMutation({
    onSuccess: () => {
      // Invalidate queries to refetch fresh data
      utils.contract.getAll.invalidate();
      alert("Contract created!");
    },
  });

  const handleSubmit = (data: ContractInput) => {
    createContract.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button
        type="submit"
        disabled={createContract.isLoading}
      >
        {createContract.isLoading ? "Creating..." : "Create Contract"}
      </button>
    </form>
  );
}
```

### Server-Side Queries

```typescript
// src/app/team/[id]/page.tsx
import { api } from "@/trpc/server";

export default async function TeamPage({ params }: { params: { id: string } }) {
  // Server-side TRPC call
  const team = await api.team.getById({ teamId: params.id });
  const roster = await api.player.getRoster({ teamId: params.id });

  return (
    <div>
      <h1>{team?.teamName}</h1>
      <ul>
        {roster?.map(player => (
          <li key={player.playerId}>{player.firstName} {player.lastName}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Custom Hooks Pattern

Wrap TRPC calls in custom hooks for reusability:

```typescript
// src/lib/hooks/data/useTeam.ts
import { api } from "@/trpc/react";

export function useTeam(teamId?: string) {
  const { data: team, isLoading: teamLoading } = api.team.getById.useQuery(
    { teamId: teamId! },
    { enabled: Boolean(teamId) },
  );

  const { data: roster, isLoading: rosterLoading } =
    api.player.getRoster.useQuery(
      { teamId: teamId! },
      { enabled: Boolean(teamId) },
    );

  const ready =
    !teamLoading && !rosterLoading && Boolean(team) && Boolean(roster);

  return { team, roster, ready };
}
```

```typescript
// Usage in component
export function TeamRosterPage() {
  const { team, roster, ready } = useTeam("A");

  if (!ready) return <Skeleton />;
  return <TeamRoster team={team} roster={roster} />;
}
```

---

## Creating New Procedures

### Step 1: Create Router File

```typescript
// src/server/api/routers/myRouter.ts
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";

export const myRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    // Fetch logic
    return [];
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      // Fetch by ID logic
      return { id: input.id };
    }),

  create: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      // Create logic
      return { success: true };
    }),
});
```

### Step 2: Add to App Router

```typescript
// src/server/api/root.ts
import { myRouter } from "./routers/myRouter";

export const appRouter = createTRPCRouter({
  // ... existing routers
  my: myRouter, // ← Add here
});
```

### Step 3: Use in Client

```typescript
// Automatically typed!
const { data } = api.my.getAll.useQuery();
const create = api.my.create.useMutation();
```

---

## Error Handling

### Server-Side Errors

Throw TRPC errors with specific codes:

```typescript
import { TRPCError } from "@trpc/server";

export const playerRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .query(async ({ input }) => {
      const player = await fetchPlayer(input.playerId);

      if (!player) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Player ${input.playerId} not found`,
        });
      }

      return player;
    }),
});
```

**Error Codes**:

- `BAD_REQUEST` - Invalid input
- `UNAUTHORIZED` - Not authenticated
- `FORBIDDEN` - Not authorized
- `NOT_FOUND` - Resource doesn't exist
- `INTERNAL_SERVER_ERROR` - Server error

### Client-Side Error Handling

```typescript
const { data, error, isError } = api.player.getById.useQuery({
  playerId: "invalid-id",
});

if (isError) {
  console.error(error.message); // "Player invalid-id not found"
  return <div>Error: {error.message}</div>;
}
```

### Mutation Error Handling

```typescript
const createPlayer = api.player.create.useMutation({
  onError: (error) => {
    if (error.data?.code === "BAD_REQUEST") {
      alert("Invalid input. Please check your data.");
    } else {
      alert("An error occurred. Please try again.");
    }
  },
  onSuccess: () => {
    alert("Player created successfully!");
  },
});
```

---

## Next Steps

To dive deeper:

- **[Data Layer](./DATA_LAYER.md)** - Understand data sources
- **[Hooks & State](./HOOKS.md)** - Learn custom hook patterns
- **[Component Architecture](./COMPONENTS.md)** - Use TRPC in components
- **[API Reference](./API_REFERENCE.md)** - Complete procedure listing

---

_For TRPC configuration details, see `src/trpc/react.tsx` and `src/server/api/trpc.ts`_
