# Custom Hooks Architecture

Complete guide to custom React hooks and state management in the GSHL application.

---

## Table of Contents

- [Overview](#overview)
- [Core Principles](#core-principles)
- [Hook Signature Pattern](#hook-signature-pattern)
- [Hook Categories](#hook-categories)
- [Building Custom Hooks](#building-custom-hooks)
- [Options Object Pattern](#options-object-pattern)
- [Return Value Contract](#return-value-contract)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

**Philosophy**: Custom hooks are the **data layer** of the application. They handle all data fetching, transformation, filtering, sorting, and business logic, keeping components pure and presentational.

### Why Custom Hooks?

✅ **Separation of Concerns**: Data logic separate from UI rendering  
✅ **Reusability**: Generic hooks with options reduce duplication  
✅ **Testability**: Test data logic independently from components  
✅ **Type Safety**: Full TypeScript support with inferred types  
✅ **Flexibility**: Options object pattern allows extensive customization  
✅ **Consistency**: Standard return contract across all hooks

---

## Core Principles

### 1. Generic & Configurable

Custom hooks should be **generic** and use an **options object** to accept various parameters. This allows fewer hooks with more functionality.

```typescript
// ❌ Bad: Multiple specific hooks
useActiveContractsByTeam(teamId)
useExpiredContractsByTeam(teamId)
useRFAContractsByTeam(teamId)

// ✅ Good: Single configurable hook
useContracts({ teamId, status: 'active' })
useContracts({ teamId, status: 'expired' })
useContracts({ teamId, status: 'rfa' })
```

### 2. Consistent Return Contract

Every custom hook **must** return an object with:
- `isLoading` - Boolean indicating data fetch state
- `error` - Error object (or null) for failed operations
- Data properties - The actual data being requested

```typescript
return {
  data: processedData,      // Primary data
  isLoading: !data,         // Loading state
  error: queryError,        // Error if any
  // ...additional contextual data
};
```

### 3. Options Object Pattern

All configuration passes through a **single options object** parameter:

```typescript
interface UsePlayerOptions {
  seasonId?: string;
  teamId?: string;
  position?: string;
  sortBy?: 'rating' | 'name' | 'age';
  includeInactive?: boolean;
  minRating?: number;
}

function usePlayers(options: UsePlayerOptions = {}) {
  // Implementation
}
```

---

## Hook Signature Pattern

### Standard Hook Signature

```typescript
/**
 * Custom hook description
 * 
 * @param options - Configuration object for hook behavior
 * @param options.requiredParam - Description of required parameter
 * @param options.optionalParam - Description of optional parameter
 * @returns Object containing data, loading state, and error
 */
export function useFeatureName(options: UseFeatureOptions = {}) {
  const {
    requiredParam,
    optionalParam = 'defaultValue',
    sortBy,
    filters,
  } = options;

  // Data fetching
  const { data, isLoading, error } = useBaseData(requiredParam);

  // Data transformation
  const processedData = useMemo(() => {
    if (!data) return [];
    
    let result = data;
    
    // Apply filters
    if (filters) {
      result = result.filter(/* filter logic */);
    }
    
    // Apply sorting
    if (sortBy) {
      result = result.sort(/* sort logic */);
    }
    
    return result;
  }, [data, filters, sortBy]);

  return {
    data: processedData,
    isLoading,
    error,
    // Additional contextual data
  };
}
```

### 1. Data Hooks (`src/lib/hooks/data/`)

**Purpose**: Direct TRPC query wrappers with minimal transformation.

**Characteristics**:
- Thin wrappers around TRPC procedures
- Accept options for query enabling/filtering
- Return standardized `{ data, isLoading, error }`
- Handle query invalidation and refetching

**Example**:
```typescript
export interface UseTeamsOptions {
  seasonId?: string;
  franchiseId?: string;
  enabled?: boolean;
}

export function useTeams(options: UseTeamsOptions = {}) {
  const { seasonId, franchiseId, enabled = true } = options;
  
  const { data, isLoading, error } = api.team.getAll.useQuery(
    { seasonId, franchiseId },
    { enabled: enabled && Boolean(seasonId) }
  );

  return {
    teams: data ?? [],
    isLoading,
    error: error ?? null,
  };
}
```

### 2. Feature Hooks (`src/lib/hooks/features/`)

**Purpose**: Transform raw data into UI-ready view models for specific features.

**Characteristics**:
- Compose multiple data hooks
- Perform filtering, sorting, grouping
- Calculate derived properties
- Return enriched data structures
- Include `ready` flag for multi-dependency loading

**Example**:
```typescript
export interface UseContractTableDataOptions {
  teamId: string;
  seasonId?: string;
  sortBy?: 'player' | 'expiry' | 'salary';
  includeExpired?: boolean;
}

export function useContractTableData(options: UseContractTableDataOptions) {
  const { teamId, seasonId, sortBy = 'player', includeExpired = false } = options;
  
  const { contracts, isLoading: contractsLoading } = useContracts({ teamId });
  const { players, isLoading: playersLoading } = usePlayers({ seasonId });
  
  const enrichedContracts = useMemo(() => {
    if (!contracts || !players) return [];
    
    let result = contracts.map(contract => ({
      ...contract,
      player: players.find(p => p.id === contract.playerId),
      expiryStatus: calculateExpiryStatus(contract, seasonId),
    }));
    
    if (!includeExpired) {
      result = result.filter(c => c.expiryStatus !== 'expired');
    }
    
    result = sortContracts(result, sortBy);
    
    return result;
  }, [contracts, players, includeExpired, sortBy, seasonId]);
  
  return {
    contracts: enrichedContracts,
    isLoading: contractsLoading || playersLoading,
    error: null,
    ready: !contractsLoading && !playersLoading,
  };
}
```

### 3. State Hooks (`src/lib/hooks/state/`)

**Purpose**: Manage global application state (navigation, filters).

**Characteristics**:
- Use Zustand for persistence
- Provide state getters and setters
- Handle cross-page state synchronization

### 4. Stats Hooks (`src/lib/hooks/stats/`)

**Purpose**: Fetch and compute statistical data.

**Characteristics**:
- Aggregate player/team statistics
- Calculate rankings and percentiles
- Handle complex stat calculations

### 5. Utility Hooks (`src/lib/hooks/utils/`)

**Purpose**: Reusable helpers (formatting, colors, etc.).

**Characteristics**:
- Simple, focused utilities
- Often pure functions wrapped in hooks
- No data fetching

---

## Building Custom Hooks

### Step-by-Step Guide

#### 1. Define Options Interface

```typescript
export interface UseFeatureOptions {
  // Required parameters (no defaults)
  entityId: string;
  
  // Optional parameters (with defaults)
  seasonId?: string;
  sortBy?: 'name' | 'date' | 'rating';
  filters?: {
    status?: string;
    minValue?: number;
  };
  
  // Query control
  enabled?: boolean;
}
```

#### 2. Define Return Type

```typescript
export interface UseFeatureResult {
  // Primary data
  data: ProcessedEntity[];
  
  // Required status fields
  isLoading: boolean;
  error: Error | null;
  
  // Optional contextual data
  ready: boolean;
  totalCount: number;
  metadata?: Record<string, unknown>;
}
```

#### 3. Implement Hook

```typescript
export function useFeature(options: UseFeatureOptions): UseFeatureResult {
  // 1. Destructure options with defaults
  const {
    entityId,
    seasonId,
    sortBy = 'name',
    filters = {},
    enabled = true,
  } = options;

  // 2. Fetch base data
  const { data: rawData, isLoading, error } = api.entity.getById.useQuery(
    { entityId, seasonId },
    { enabled: enabled && Boolean(entityId) }
  );

  // 3. Transform data
  const processedData = useMemo(() => {
    if (!rawData) return [];
    
    let result = rawData;
    
    // Apply filters
    if (filters.status) {
      result = result.filter(item => item.status === filters.status);
    }
    
    if (filters.minValue) {
      result = result.filter(item => item.value >= filters.minValue);
    }
    
    // Apply sorting
    result = sortData(result, sortBy);
    
    return result;
  }, [rawData, filters, sortBy]);

  // 4. Return standardized object
  return {
    data: processedData,
    isLoading,
    error: error ?? null,
    ready: !isLoading && !error,
    totalCount: processedData.length,
  };
}
```

---

## Options Object Pattern

### Benefits

1. **Backwards Compatible**: Add new options without breaking existing calls
2. **Self-Documenting**: Named parameters make intent clear
3. **Flexible**: Easy to add filters, sorting, pagination
4. **Type Safe**: Full TypeScript support

### Pattern Examples

#### Basic Options
```typescript
interface BasicOptions {
  id: string;
  enabled?: boolean;
}

useSomething({ id: '123' })
useSomething({ id: '123', enabled: false })
```

#### Filtering Options
```typescript
interface FilterOptions {
  teamId: string;
  filters?: {
    position?: string;
    minRating?: number;
    status?: 'active' | 'inactive';
  };
}

usePlayers({ teamId: '1' })
usePlayers({ 
  teamId: '1', 
  filters: { position: 'C', minRating: 80 } 
})
```

#### Sorting Options
```typescript
interface SortOptions {
  teamId: string;
  sortBy?: 'name' | 'rating' | 'age';
  sortDirection?: 'asc' | 'desc';
}

usePlayers({ teamId: '1', sortBy: 'rating', sortDirection: 'desc' })
```

#### Pagination Options
```typescript
interface PaginationOptions {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

useData({ page: 1, pageSize: 20 })
```

### Dynamic Return Values

Options can also control **what** is returned:

```typescript
interface UsePlayerOptions {
  playerId: string;
  include?: {
    stats?: boolean;
    contracts?: boolean;
    teams?: boolean;
  };
}

function usePlayer(options: UsePlayerOptions) {
  const { playerId, include = {} } = options;
  
  const { data: player } = usePlayerData(playerId);
  const { data: stats } = usePlayerStats(playerId, {
    enabled: include.stats
  });
  const { data: contracts } = usePlayerContracts(playerId, {
    enabled: include.contracts
  });
  
  return {
    player,
    stats: include.stats ? stats : undefined,
    contracts: include.contracts ? contracts : undefined,
    isLoading: !player,
    error: null,
  };
}

// Usage
usePlayer({ playerId: '1' }) // Just player
usePlayer({ playerId: '1', include: { stats: true } }) // Player + stats
usePlayer({ playerId: '1', include: { stats: true, contracts: true } }) // All
```

---

## Return Value Contract

### Required Fields

Every hook **must** return these fields:

```typescript
{
  isLoading: boolean;  // True while fetching data
  error: Error | null; // Error object or null
}
```

### Standard Patterns

#### Simple Data Hook
```typescript
return {
  data: processedData,
  isLoading,
  error,
};
```

#### Multi-Source Hook
```typescript
return {
  primaryData,
  secondaryData,
  isLoading: primaryLoading || secondaryLoading,
  error: primaryError || secondaryError,
  ready: !primaryLoading && !secondaryLoading,
};
```

#### Hook with Metadata
```typescript
return {
  data: items,
  isLoading,
  error,
  totalCount: items.length,
  filteredCount: filtered.length,
  metadata: { lastUpdated, source },
};
```

---

## Best Practices

### 1. Always Use Options Object

```typescript
// ❌ Bad: Positional parameters
function usePlayer(playerId: string, seasonId?: string, includeStats?: boolean)

// ✅ Good: Options object
function usePlayer(options: { playerId: string; seasonId?: string; includeStats?: boolean; })
```

### 2. Provide Sensible Defaults

```typescript
export function usePlayers(options: UsePlayersOptions = {}) {
  const {
    sortBy = 'name',           // Default sorting
    sortDirection = 'asc',     // Default direction
    includeInactive = false,   // Default filter
    enabled = true,            // Default query state
  } = options;
  // ...
}
```

### 3. Memoize Expensive Computations

```typescript
const sortedPlayers = useMemo(() => {
  if (!players) return [];
  return sortPlayers(players, sortBy, sortDirection);
}, [players, sortBy, sortDirection]);
```

### 4. Handle Loading States Properly

```typescript
// ❌ Bad: Doesn't handle loading
if (!data) return { data: [], isLoading: false, error: null };

// ✅ Good: Explicit loading check
return {
  data: data ?? [],
  isLoading: !data && !error,
  error: error ?? null,
};
```

### 5. Use `ready` Flag for Multi-Dependencies

```typescript
const { contracts, isLoading: contractsLoading } = useContracts({ teamId });
const { players, isLoading: playersLoading } = usePlayers();

const ready = !contractsLoading && !playersLoading;

return { contracts, players, isLoading: contractsLoading || playersLoading, error: null, ready };
```

### 6. Document Options Thoroughly

```typescript
/**
 * Fetch and process team roster data
 * 
 * @param options - Configuration object
 * @param options.teamId - Team identifier (required)
 * @param options.seasonId - Season to filter by (optional)
 * @param options.sortBy - Sort field: 'name' | 'rating' | 'position'
 * @param options.includeInactive - Whether to include inactive players
 * @returns Roster data with loading and error states
 * 
 * @example
 * ```tsx
 * const { roster, isLoading } = useRoster({ 
 *   teamId: '1', 
 *   sortBy: 'rating' 
 * });
 * ```
 */
```

### 7. Keep Hooks Focused

```typescript
// ❌ Bad: Hook does too much
function useEverything(teamId: string) {
  // Fetches players, contracts, stats, history, schedule...
  // Returns 20+ properties
}

// ✅ Good: Focused hooks
function useTeamRoster(options: { teamId: string })
function useTeamStats(options: { teamId: string })
function useTeamSchedule(options: { teamId: string })
```

### 8. Enable/Disable Queries Conditionally

```typescript
const { data, isLoading } = api.player.getById.useQuery(
  { playerId },
  { 
    enabled: Boolean(playerId) && enabled // Only run if ID exists and enabled
  }
);
```

---

## Examples

### Example 1: Simple Data Hook

```typescript
// src/lib/hooks/data/useSeasons.ts

export interface UseSeasonsOptions {
  enabled?: boolean;
}

export function useSeasons(options: UseSeasonsOptions = {}) {
  const { enabled = true } = options;
  
  const { data, isLoading, error } = api.season.getAll.useQuery(
    undefined,
    { enabled }
  );

  return {
    seasons: data ?? [],
    isLoading,
    error: error ?? null,
  };
}
```

### Example 2: Filtered & Sorted Hook

```typescript
// src/lib/hooks/features/usePlayerList.ts

export interface UsePlayerListOptions {
  seasonId?: string;
  teamId?: string;
  position?: string;
  sortBy?: 'name' | 'rating' | 'age';
  sortDirection?: 'asc' | 'desc';
  minRating?: number;
}

export function usePlayerList(options: UsePlayerListOptions = {}) {
  const {
    seasonId,
    teamId,
    position,
    sortBy = 'rating',
    sortDirection = 'desc',
    minRating,
  } = options;

  const { data: players, isLoading, error } = api.player.getAll.useQuery({
    seasonId,
    teamId,
  });

  const processedPlayers = useMemo(() => {
    if (!players) return [];
    
    let result = players;
    
    // Filter by position
    if (position) {
      result = result.filter(p => p.position === position);
    }
    
    // Filter by min rating
    if (minRating !== undefined) {
      result = result.filter(p => p.rating >= minRating);
    }
    
    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const comparison = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [players, position, minRating, sortBy, sortDirection]);

  return {
    players: processedPlayers,
    isLoading,
    error: error ?? null,
    totalCount: players?.length ?? 0,
    filteredCount: processedPlayers.length,
  };
}
```

### Example 3: Multi-Source Hook

```typescript
// src/lib/hooks/features/useTeamDashboard.ts

export interface UseTeamDashboardOptions {
  teamId: string;
  seasonId?: string;
  includeSchedule?: boolean;
  includeStats?: boolean;
}

export function useTeamDashboard(options: UseTeamDashboardOptions) {
  const {
    teamId,
    seasonId,
    includeSchedule = true,
    includeStats = true,
  } = options;

  const { team, isLoading: teamLoading } = useTeam({ teamId });
  const { roster, isLoading: rosterLoading } = useRoster({ teamId, seasonId });
  const { schedule, isLoading: scheduleLoading } = useSchedule({
    teamId,
    enabled: includeSchedule,
  });
  const { stats, isLoading: statsLoading } = useTeamStats({
    teamId,
    seasonId,
    enabled: includeStats,
  });

  const isLoading = teamLoading || rosterLoading || 
                    (includeSchedule && scheduleLoading) ||
                    (includeStats && statsLoading);

  return {
    team,
    roster,
    schedule: includeSchedule ? schedule : undefined,
    stats: includeStats ? stats : undefined,
    isLoading,
    error: null,
    ready: !isLoading,
  };
}
```

### Example 4: Hook with Complex Filtering

```typescript
// src/lib/hooks/features/useContractSearch.ts

export interface ContractFilters {
  status?: 'active' | 'expired' | 'rfa' | 'ufa';
  minSalary?: number;
  maxSalary?: number;
  expiryYear?: number;
  position?: string;
}

export interface UseContractSearchOptions {
  teamId?: string;
  filters?: ContractFilters;
  sortBy?: 'salary' | 'expiry' | 'player';
  sortDirection?: 'asc' | 'desc';
}

export function useContractSearch(options: UseContractSearchOptions = {}) {
  const {
    teamId,
    filters = {},
    sortBy = 'salary',
    sortDirection = 'desc',
  } = options;

  const { contracts, isLoading } = useContracts({ teamId });
  const { players } = usePlayers();

  const enrichedContracts = useMemo(() => {
    if (!contracts || !players) return [];
    
    return contracts.map(contract => ({
      ...contract,
      player: players.find(p => p.id === contract.playerId),
    }));
  }, [contracts, players]);

  const filteredContracts = useMemo(() => {
    let result = enrichedContracts;
    
    // Status filter
    if (filters.status) {
      result = result.filter(c => c.status === filters.status);
    }
    
    // Salary range filter
    if (filters.minSalary !== undefined) {
      result = result.filter(c => c.salary >= filters.minSalary);
    }
    if (filters.maxSalary !== undefined) {
      result = result.filter(c => c.salary <= filters.maxSalary);
    }
    
    // Expiry year filter
    if (filters.expiryYear) {
      result = result.filter(c => 
        new Date(c.expiryDate).getFullYear() === filters.expiryYear
      );
    }
    
    // Position filter
    if (filters.position) {
      result = result.filter(c => c.player?.position === filters.position);
    }
    
    // Sort
    result = sortContracts(result, sortBy, sortDirection);
    
    return result;
  }, [enrichedContracts, filters, sortBy, sortDirection]);

  return {
    contracts: filteredContracts,
    isLoading,
    error: null,
    totalCount: enrichedContracts.length,
    filteredCount: filteredContracts.length,
  };
}
```

---

## Migration Guide

### Converting Existing Hooks to Options Pattern

**Before**:
```typescript
function usePlayerStats(playerId: string, seasonId?: string) {
  // ...
}

// Limited call patterns
usePlayerStats('123');
usePlayerStats('123', 'S12');
```

**After**:
```typescript
interface UsePlayerStatsOptions {
  playerId: string;
  seasonId?: string;
  includeAdvanced?: boolean;
  compareToAverage?: boolean;
}

function usePlayerStats(options: UsePlayerStatsOptions) {
  const {
    playerId,
    seasonId,
    includeAdvanced = false,
    compareToAverage = false,
  } = options;
  // ...
}

// Flexible call patterns
usePlayerStats({ playerId: '123' });
usePlayerStats({ playerId: '123', seasonId: 'S12' });
usePlayerStats({ playerId: '123', includeAdvanced: true });
usePlayerStats({ 
  playerId: '123', 
  seasonId: 'S12', 
  includeAdvanced: true, 
  compareToAverage: true 
});
```

---

## Summary

**Custom Hook Architecture Principles:**

1. ✅ **Options Object Pattern** - All parameters in single config object
2. ✅ **Consistent Returns** - Always include `isLoading`, `error`, and data
3. ✅ **Generic & Flexible** - One hook with options > many specific hooks
4. ✅ **Proper Memoization** - Use `useMemo` for expensive transformations
5. ✅ **Loading States** - Handle multi-source loading with `ready` flag
6. ✅ **Type Safety** - Full TypeScript interfaces for options and returns
7. ✅ **Documentation** - Comprehensive JSDoc with examples
8. ✅ **Focused Responsibility** - Each hook has clear, single purpose

This architecture ensures custom hooks are **reusable**, **maintainable**, **type-safe**, and **powerful** while keeping components clean and simple.
