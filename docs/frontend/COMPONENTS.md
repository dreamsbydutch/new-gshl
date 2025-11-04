# Component Architecture

## Overview

GSHL components follow a **strict single-file, single-export architecture** that separates data logic from presentation. This ensures components are predictable, testable, and maintainable.

## Core Principles

### 1. Single File, Single Export

- Each component is a **single `.tsx` file** (not a folder)
- Each component has **exactly one default or named export**
- Internal helper components are defined as `const` functions within the same file
- No barrel exports (`index.ts`) within component files

### 2. Data vs. Presentation Separation

- **Components are for rendering only** — no data fetching, no business logic
- All data comes from **custom hooks** (located in `src/lib/hooks`)
- All business logic, calculations, and transformations happen in hooks
- Components receive clean, ready-to-render data through props

### 3. Component Responsibilities

Components should **only**:

- Accept data via props
- Render UI based on that data
- Handle user interactions by calling prop callbacks
- Compose other components
- Route between different views/states

Components should **never**:

- Fetch data directly (use hooks instead)
- Perform calculations or data transformations
- Contain business logic
- Export multiple components
- Manage complex state (delegate to hooks)

---

## File Structure

### Standard Component File

```tsx
"use client";

/**
 * ComponentName Component
 *
 * Brief description of what this component displays and its purpose.
 * Explain the key features and user-facing functionality.
 *
 * @param prop1 - Description of prop1
 * @param prop2 - Description of prop2
 */

import { ... } from "...";

// ============================================================================
// INTERNAL COMPONENTS (if needed)
// ============================================================================

/**
 * InternalComponent
 *
 * Helper component used internally by ComponentName.
 * Not exported - only for use within this file.
 */
const InternalComponent = ({ data }: { data: SomeType }) => {
  return (
    <div>...</div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Main component export with full JSDoc
 */
export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  // Call hooks to get data
  const { data, isLoading, error } = useComponentData({ prop1, prop2 });

  // Early returns for loading/error states
  if (isLoading) return <ComponentSkeleton />;
  if (error) return <ErrorMessage error={error} />;

  // Render using clean data from hook
  return (
    <div>
      <InternalComponent data={data} />
    </div>
  );
}
```

---

## Component Patterns

### Pattern 1: Simple Presentational Component

**Purpose**: Display data with no internal state or logic

```tsx
"use client";

/**
 * PlayerCard Component
 *
 * Displays a player's basic information in a card format.
 */

import { NHLLogo } from "@gshl-ui";
import { formatNumber } from "@gshl-utils";
import type { Player, NHLTeam } from "@gshl-types";

interface PlayerCardProps {
  player: Player;
  nhlTeams: NHLTeam[];
}

export function PlayerCard({ player, nhlTeams }: PlayerCardProps) {
  const nhlTeam = nhlTeams.find((t) => t.abbreviation === player.nhlTeam);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <NHLLogo team={nhlTeam} size={32} />
        <h3 className="font-bold">{player.fullName}</h3>
      </div>
      <p className="text-muted-foreground text-sm">
        {player.nhlPos.toString()} • Age {formatNumber(player.age, 1)}
      </p>
      <p className="mt-2">Rating: {formatNumber(player.seasonRating, 2)}</p>
    </div>
  );
}
```

### Pattern 2: Container Component with Hook

**Purpose**: Fetch and prepare data, then render presentation

```tsx
"use client";

/**
 * TeamRoster Component
 *
 * Displays a team's complete roster organized by position.
 * Fetches roster data and handles loading states.
 */

import { useTeamRoster } from "@gshl-hooks";
import { TeamRosterSkeleton } from "@gshl-skeletons";
import { PlayerCard } from "@gshl-components/PlayerCard";
import type { Player } from "@gshl-types";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

const RosterSection = ({
  title,
  players,
}: {
  title: string;
  players: Player[];
}) => {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {players.map((player) => (
          <PlayerCard key={player.id} player={player} />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

interface TeamRosterProps {
  teamId: string;
  seasonId: string;
}

export function TeamRoster({ teamId, seasonId }: TeamRosterProps) {
  // Hook handles all data fetching and organization
  const { forwards, defense, goalies, isLoading } = useTeamRoster({
    teamId,
    seasonId,
  });

  if (isLoading) return <TeamRosterSkeleton />;

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">Roster</h2>
      <RosterSection title="Forwards" players={forwards} />
      <RosterSection title="Defense" players={defense} />
      <RosterSection title="Goalies" players={goalies} />
    </div>
  );
}
```

### Pattern 3: Component with State Routing

**Purpose**: Handle view state and conditional rendering

```tsx
"use client";

/**
 * DraftBoard Component
 *
 * Displays draft-eligible players with filtering and view options.
 * Supports table view and mock draft view.
 */

import { useState } from "react";
import { useDraftBoardData } from "@gshl-hooks";
import { HorizontalToggle } from "@gshl-nav";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

const DraftTable = ({ players }: { players: Player[] }) => {
  return <table>...</table>;
};

const MockDraft = ({
  picks,
  players,
}: {
  picks: DraftPick[];
  players: Player[];
}) => {
  return <div>...</div>;
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function DraftBoard({ seasonId }: { seasonId: string }) {
  const [view, setView] = useState<"table" | "mock">("table");
  const [positionFilter, setPositionFilter] = useState<string>("all");

  // Hook provides filtered, sorted data
  const { players, picks, isLoading } = useDraftBoardData({
    seasonId,
    positionFilter,
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <HorizontalToggle
        selectedItem={view}
        onSelect={setView}
        items={[
          { key: "table", label: "Player List" },
          { key: "mock", label: "Mock Draft" },
        ]}
      />

      {view === "table" ? (
        <DraftTable players={players} />
      ) : (
        <MockDraft picks={picks} players={players} />
      )}
    </div>
  );
}
```

### Pattern 4: Component Composition

**Purpose**: Build complex UIs by composing smaller components

```tsx
"use client";

/**
 * LockerRoom Component
 *
 * Team dashboard showing roster, contracts, draft picks, and history.
 * Composes multiple feature components based on selected tab.
 */

import { useState } from "react";
import { TeamRoster } from "@gshl-components/TeamRoster";
import { TeamContracts } from "@gshl-components/contracts/ContractTable";
import { TeamDraftPicks } from "@gshl-components/TeamDraftPickList";
import { TeamHistory } from "@gshl-components/TeamHistory";

interface LockerRoomProps {
  teamId: string;
  seasonId: string;
}

export function LockerRoom({ teamId, seasonId }: LockerRoomProps) {
  const [activeTab, setActiveTab] = useState<string>("roster");

  return (
    <div>
      <nav className="mb-4">
        <button onClick={() => setActiveTab("roster")}>Roster</button>
        <button onClick={() => setActiveTab("contracts")}>Contracts</button>
        <button onClick={() => setActiveTab("picks")}>Draft Picks</button>
        <button onClick={() => setActiveTab("history")}>History</button>
      </nav>

      {activeTab === "roster" && (
        <TeamRoster teamId={teamId} seasonId={seasonId} />
      )}
      {activeTab === "contracts" && (
        <TeamContracts teamId={teamId} seasonId={seasonId} />
      )}
      {activeTab === "picks" && (
        <TeamDraftPicks teamId={teamId} seasonId={seasonId} />
      )}
      {activeTab === "history" && <TeamHistory teamId={teamId} />}
    </div>
  );
}
```

---

## Hook Integration

### Custom Hooks Handle All Data Logic

Components receive data from custom hooks located in `src/lib/hooks`. Hooks are responsible for:

- **Data Fetching**: tRPC queries, API calls
- **Data Transformation**: Sorting, filtering, grouping
- **Calculations**: Stats, aggregations, derived values
- **State Management**: Complex state logic
- **Business Rules**: Validation, permissions, conditions

**Example Hook:**

```typescript
// src/lib/hooks/useTeamRoster.ts
export function useTeamRoster({ teamId, seasonId }: UseTeamRosterProps) {
  const { data: players } = api.player.byTeam.useQuery({ teamId, seasonId });
  const { data: nhlTeams } = api.nhl.teams.useQuery();

  // Data transformation and organization
  const forwards = useMemo(
    () =>
      players
        ?.filter((p) => ["C", "LW", "RW"].includes(p.nhlPos))
        .sort((a, b) => b.seasonRating - a.seasonRating) ?? [],
    [players],
  );

  const defense = useMemo(
    () =>
      players
        ?.filter((p) => p.nhlPos === "D")
        .sort((a, b) => b.seasonRating - a.seasonRating) ?? [],
    [players],
  );

  const goalies = useMemo(
    () =>
      players
        ?.filter((p) => p.nhlPos === "G")
        .sort((a, b) => b.seasonRating - a.seasonRating) ?? [],
    [players],
  );

  return {
    forwards,
    defense,
    goalies,
    nhlTeams: nhlTeams ?? [],
    isLoading: !players || !nhlTeams,
  };
}
```

**Component using the hook:**

```tsx
export function TeamRoster({ teamId, seasonId }: TeamRosterProps) {
  // Component receives clean, organized data
  const { forwards, defense, goalies, nhlTeams, isLoading } = useTeamRoster({
    teamId,
    seasonId,
  });

  // Component only renders - no logic
  if (isLoading) return <TeamRosterSkeleton />;

  return (
    <div>
      <RosterSection title="Forwards" players={forwards} nhlTeams={nhlTeams} />
      <RosterSection title="Defense" players={defense} nhlTeams={nhlTeams} />
      <RosterSection title="Goalies" players={goalies} nhlTeams={nhlTeams} />
    </div>
  );
}
```

---

## Import Aliases

Use TypeScript path aliases for clean imports:

```tsx
// UI Components
import { Button, Table, NHLLogo } from "@gshl-ui";

// Custom Hooks
import { useTeamRoster, useContractData } from "@gshl-hooks";

// Feature Components
import { TeamRoster } from "@gshl-components/TeamRoster";
import { ContractTable } from "@gshl-components/contracts/ContractTable";

// Skeletons
import { TeamRosterSkeleton } from "@gshl-skeletons";

// Types
import type { Player, Team, Season } from "@gshl-types";

// Utilities
import { formatMoney, formatNumber } from "@gshl-utils";

// Navigation/Layout
import { HorizontalToggle } from "@gshl-nav";

// State Management
import { useNavStore } from "@gshl-cache";
```

See [`docs/reference/IMPORT_ALIASES.md`](../reference/IMPORT_ALIASES.md) for complete mapping.

---

## Component Organization

### File Locations

```
src/components/
├── team/                      # Team-related components
│   ├── index.ts              # Barrel export
│   ├── LockerRoomHeader.tsx
│   ├── TeamDraftPickList.tsx
│   ├── TeamHistory.tsx
│   ├── TeamRoster.tsx
│   └── TeamSchedule.tsx
├── contracts/                 # Contract management components
│   ├── index.ts              # Barrel export
│   ├── ContractTable.tsx
│   ├── ContractHistory.tsx
│   └── FreeAgencyList.tsx
├── draft/                     # Draft-related components
│   ├── index.ts              # Barrel export
│   ├── DraftBoardList.tsx
│   ├── DraftAdminList.tsx
│   └── DraftAnnouncement.tsx
├── league/                    # League-wide components
│   ├── index.ts              # Barrel export
│   ├── StandingsContainer.tsx
│   └── WeeklySchedule.tsx
├── admin/                     # Administrative tools
│   ├── index.ts              # Barrel export
│   ├── ServiceAccountInfo.tsx
│   ├── YahooScraperControl.tsx
│   ├── YahooScraperTester.tsx
│   ├── LeagueStatsUpdater.tsx
│   ├── SeasonStatsUpdater.tsx
│   └── PlayerWeekAggregator.tsx
├── skeletons/                 # Loading skeletons
│   ├── index.ts              # Barrel export for skeletons
│   ├── TeamRosterSkeleton.tsx
│   └── DraftPickListSkeleton.tsx
└── ui/                        # Shared UI primitives
    ├── button.tsx
    ├── table.tsx
    └── ...
```

### Naming Conventions

- **Components**: PascalCase, descriptive (`TeamRoster`, `DraftBoardList`)
- **Files**: Match component name (`TeamRoster.tsx`)
- **Internal Components**: PascalCase const (`const RosterSection = ...`)
- **Props Interfaces**: `ComponentNameProps`
- **Hooks**: `useFeatureName` (camelCase, starts with "use")

---

## Best Practices

### ✅ Do This

```tsx
// ✅ Component receives data from hook with options object
export function PlayerList({ seasonId }: { seasonId: string }) {
  const { players, isLoading, error } = usePlayerList({
    seasonId,
    sortBy: "rating",
    includeInactive: false,
  });

  if (isLoading) return <PlayerListSkeleton />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div>
      {players.map((p) => (
        <PlayerCard key={p.id} player={p} />
      ))}
    </div>
  );
}

// ✅ Single export per file
export function ContractTable({ teamId }: ContractTableProps) {
  // ...
}

// ✅ Internal helper components
const TableRow = ({ contract }: { contract: Contract }) => {
  return <tr>...</tr>;
};
```

### ❌ Don't Do This

```tsx
// ❌ Don't fetch data in components
export function PlayerList() {
  const { data } = api.player.all.useQuery(); // WRONG - use a hook
  // ...
}

// ❌ Don't perform calculations in components
export function TeamStats({ games }: { games: Game[] }) {
  const totalWins = games.filter((g) => g.result === "W").length; // WRONG - do in hook
  // ...
}

// ❌ Don't export multiple components from one file
export function ComponentA() {
  /* ... */
}
export function ComponentB() {
  /* ... */
} // WRONG - one export per file

// ❌ Don't use folders for components
src / components / TeamRoster / main.tsx; // WRONG - use TeamRoster.tsx directly

// ❌ Don't create hooks for trivial logic
const formattedName = useMemo(() => formatName(player), [player]); // WRONG - just call formatName()
const ownerName = useOwnerName(team); // WRONG if it only does: formatOwnerName(team)
```

---

## Testing Approach

### Testing Components

Components are easy to test because they're pure functions:

```tsx
import { render, screen } from "@testing-library/react";
import { PlayerCard } from "./PlayerCard";

test("displays player name and position", () => {
  const player = {
    id: "1",
    fullName: "Connor McDavid",
    nhlPos: "C",
    age: 26,
    seasonRating: 95.5,
  };

  render(<PlayerCard player={player} nhlTeams={[]} />);

  expect(screen.getByText("Connor McDavid")).toBeInTheDocument();
  expect(screen.getByText(/C • Age 26/)).toBeInTheDocument();
});
```

### Testing Hooks

Hook logic is tested separately:

```tsx
import { renderHook } from "@testing-library/react";
import { useTeamRoster } from "./useTeamRoster";

test("organizes players by position", () => {
  const { result } = renderHook(() =>
    useTeamRoster({ teamId: "1", seasonId: "12" }),
  );

  expect(result.current.forwards).toHaveLength(12);
  expect(result.current.defense).toHaveLength(6);
  expect(result.current.goalies).toHaveLength(2);
});
```

---

## Migration Guide

### Converting Folder Components to Single Files

**Before** (folder structure):

```
ContractTable/
├── main.tsx
├── components/
│   ├── TableHeader.tsx
│   └── PlayerRow.tsx
└── hooks/
    └── useContractData.ts
```

**After** (single file):

```tsx
// src/components/contracts/ContractTable.tsx

"use client";

import { useContractData } from "@gshl-hooks"; // Hook moved to global hooks

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

const TableHeader = ({ seasons }: { seasons: Season[] }) => {
  return <thead>...</thead>;
};

const PlayerRow = ({
  contract,
  player,
}: {
  contract: Contract;
  player: Player;
}) => {
  return <tr>...</tr>;
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function ContractTable({ teamId, seasonId }: ContractTableProps) {
  const { contracts, players, seasons, isLoading } = useContractData({
    teamId,
    seasonId,
  });

  if (isLoading) return <ContractTableSkeleton />;

  return (
    <table>
      <TableHeader seasons={seasons} />
      <tbody>
        {contracts.map((c) => (
          <PlayerRow
            key={c.id}
            contract={c}
            player={players.find((p) => p.id === c.playerId)}
          />
        ))}
      </tbody>
    </table>
  );
}
```

---

## Summary

**Component Architecture Principles:**

1. **Single file, single export** - One component per file, one export per file
2. **Data from hooks** - All data fetching and logic in custom hooks
3. **Pure rendering** - Components only render, no calculations or transformations
4. **Composition** - Build complex UIs by composing simple components
5. **Internal helpers** - Use const components for internal structure
6. **Clear separation** - Data layer (hooks) → Presentation layer (components)

This architecture ensures components are **predictable, testable, and maintainable** while keeping business logic centralized in reusable hooks.
