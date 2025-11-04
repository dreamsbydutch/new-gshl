# Import Alias Reference Guide

## Overview

This project uses TypeScript path aliases to maintain clean, consistent imports throughout the codebase. All aliases are configured in `tsconfig.json` under the `paths` property.

## Core Principles

1. **Never use relative imports** that go up more than one directory level
2. **Always use aliases** for cross-module imports
3. **Component imports** should use `/main.tsx` explicitly when importing feature components
4. **Server-only code** must use `@gshl-trpc/*` or `@gshl-server/*`, never the main barrel

---

## Available Import Aliases

### Environment & Configuration

```typescript
import { env } from "@gshl-env";
```

### Components

#### Feature Components (have main.tsx + sub-components)

```typescript
// Main component exports
import { TeamSchedule } from "@gshl-components/team/TeamSchedule/main";
import { WeeklySchedule } from "@gshl-components/league/WeeklySchedule/main";
import { ContractTable } from "@gshl-components/contracts/ContractTable/main";
import { DraftBoardList } from "@gshl-components/draft/DraftBoardList/main";

// Sub-components (from components/index.ts)
import {
  RosterLineup,
  BenchPlayers,
} from "@gshl-components/team/TeamRoster/components";
```

#### Admin Components

```typescript
import {
  YahooScraperControl,
  LeagueStatsUpdater,
  SeasonStatsUpdater,
  ServiceAccountInfo,
  PlayerWeekAggregator,
} from "@gshl-components/admin";
```

#### UI Components

```typescript
import { Button, Input, Select, Card } from "@gshl-ui";
import { SeasonToggleNav, WeeksToggle, TeamsToggle } from "@gshl-nav";
import { ScheduleSkeleton, TeamContractTableSkeleton } from "@gshl-skeletons";
```

### Hooks

```typescript
// Feature hooks
import {
  useTeamScheduleData,
  useWeeklyScheduleData,
  useContractTableData,
} from "@gshl-hooks";

// Data hooks
import { useAllTeams, useTeamsBySeasonId } from "@gshl-hooks";

// State hooks
import { useNavStore, useStandingsNavigation } from "@gshl-cache";
import { useSeasonState } from "@gshl-hooks";
```

### Utilities

```typescript
import { cn, formatDate, formatCurrency } from "@gshl-utils";
import { findSeasonById, findTeamById } from "@gshl-utils";
```

### Types

```typescript
import type { GSHLTeam, Player, Contract, Season } from "@gshl-types";
```

### TRPC

#### Client-side (use in components/pages)

```typescript
import { clientApi } from "@gshl-trpc";

// In components:
const { data } = clientApi.team.getAll.useQuery();
const utils = clientApi.useUtils();
```

#### Server-side (use in server components/API routes)

```typescript
import { serverApi, HydrateClient } from "@gshl-trpc/server-exports";

// In server components:
await serverApi.team.getAll.prefetch({ ... });
```

### Server

```typescript
// Server API (router definitions, tRPC setup)
import { createTRPCRouter, publicProcedure } from "@gshl-api";

// Server utilities
import { optimizedSheetsAdapter } from "@gshl-sheets";

// Server barrel (use in API routes)
import { optimizedSheetsAdapter } from "@gshl-server";
```

### Data Providers

```typescript
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { yahooApiClient } from "@gshl-yahoo";
import { nhlApiClient } from "@gshl-nhl";
```

### Styles

```typescript
import "@gshl-styles"; // globals.css
```

---

## Common Import Patterns

### Page Component

```typescript
"use client";

import { useNavStore } from "@gshl-cache";
import { TeamSchedule } from "@gshl-components/team/TeamSchedule/main";
import { useTeamScheduleData } from "@gshl-hooks";
import type { GSHLTeam } from "@gshl-types";

export default function Page() {
  // ...
}
```

### Server Component with Prefetch

```typescript
import { serverApi, HydrateClient } from "@gshl-trpc/server-exports";

export default async function Page() {
  await serverApi.team.getAll.prefetch({ ... });

  return (
    <HydrateClient>
      <ClientComponent />
    </HydrateClient>
  );
}
```

### Feature Component

```typescript
"use client";

import { useFeatureData } from "@gshl-hooks";
import { ComponentA, ComponentB } from "./components";
import type { DataType } from "@gshl-types";

export function FeatureName() {
  const { data } = useFeatureData();
  return <div>...</div>;
}
```

### Hook

```typescript
"use client";

import { clientApi } from "@gshl-trpc";
import { useNavStore } from "@gshl-cache";
import type { Team } from "@gshl-types";
import { filterTeams, sortTeams } from "@gshl-utils";

export function useCustomHook() {
  const selectedSeason = useNavStore((s) => s.selectedSeasonId);
  const { data } = clientApi.team.getAll.useQuery();
  // ...
}
```

---

## Migration Checklist

When adding new code, ensure:

- [ ] No relative imports beyond `./` or `../`
- [ ] All component imports use `/main.tsx` when appropriate
- [ ] Server-only code uses `@gshl-trpc/server-exports` or `@gshl-server/*`
- [ ] Barrel exports exist for new component folders
- [ ] New aliases added to `tsconfig.json` if needed

---

## Troubleshooting

### "Cannot find module @gshl-X"

1. Check `tsconfig.json` for the alias
2. Ensure the target file exists
3. Restart TypeScript server (VS Code: `Cmd+Shift+P` > "Restart TS Server")

### "Module has no exported member X"

1. Check the barrel file (`index.ts`) exports the member
2. Verify the import matches the export name
3. For components, ensure you're using `/main.tsx` if it's a feature component

### Server-only import error

- Never import `@gshl-trpc/server-exports` in client components
- Use `@gshl-trpc` (which exports `clientApi`) in client code
- Server components should use `import { serverApi } from "@gshl-trpc/server-exports"`
