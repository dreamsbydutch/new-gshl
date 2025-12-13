# Staged Weekly Schedule Loading Plan

## Summary

Goal: cut `/schedule` initial render time by requesting only the active week on first paint while prefetching other weeks in the background. This keeps the UI responsive yet retains fast navigation across weeks.

---

## Milestones & Steps

### 1. Default Navigation Week to "Current"

- [x] Enhance the nav store initialization so `selectedWeekId` resolves to the current week when the app mounts.
- [x] Fetch the list of weeks (already available via `useWeeks`/TRPC) and find the entry whose `startDate <= today <= endDate` (inclusive, using raw `YYYY-MM-DD` comparisons to avoid timezone drift).
- [x] Fall back to the most recent week before today if the current week hasn’t started or to the first week if no match exists (handles offseason data).
- [x] Persist the detected `weekId` in the nav store so all schedule consumers receive the same default.
- [ ] Add unit coverage around the date-matching helper to guard against timezone regressions.

> ✅ Step 1 mostly complete (tests pending) — moving on to Step 2 analysis.

### 2. Analyze Current Fetch Graph

- [x] Profile `/schedule` to quantify which queries execute on first render (React Profiler + Network tab).
- [x] Document which hooks call season-wide endpoints (e.g., `useSeasonMatchupsAndTeams`).
- [x] Confirm `usePlayerStats` already filters by week so no further change is needed there.

> Initial code review shows `useWeeklyScheduleData` calls `useSeasonMatchupsAndTeams`, which fetches all matchups and teams for the selected season via `useMatchups`/`useTeams`. Additional queries triggered on `/schedule` load include the active `usePlayers` list, weekly `usePlayerStats` (already limited to the active week), and `useTeams` for team weekly stats. The next step is to capture runtime metrics (React Profiler + Network) to quantify the exact payloads, but the code review already identifies the season-wide collections as the heaviest dependencies.

> ✅ Step 2 complete — moving on to Step 3 (week-scoped hook design) while keeping actual profiling on the radar for validation.

### 3. Support Week-Scoped Matchup Fetching

- [x] Extend `useSeasonMatchupsAndTeams` (or create `useWeekMatchupsAndTeams`) to accept `weekId`.
- [x] If `weekId` is provided, pass it through to `useMatchups` and `useTeams` so only that week’s rows are fetched.
- [x] Update return types to note when results are week-scoped vs season-scoped.
- [x] Add unit tests or storybook mocks to ensure the hook still works without `weekId`.

- 🛠️ Step 3 has started: the plan is to make the season hook optionally week-aware so `/schedule` can request just one week on the initial render.
- Hook now exposes an `isWeekScoped` flag and forwards the optional `weekId` to both queries; both modes are covered by the new Vitest suite.

> ✅ Step 3 complete — we can move on to Step 4 (week-aware `useWeeklyScheduleData`).

### 4. Trim `useWeeklyScheduleData` Initial Payload

- [x] Switch its matchup/team source to the new week-aware hook.
- [x] Keep `usePlayerStats` configured for `includeWeekly` only.
- [x] Verify `usePlayers` remains limited to active players + lazy inactive lookups (current behavior).
- [ ] Measure `/schedule` load again to confirm the large season fetch is gone.

> ✅ Step 4 mostly complete (profiling still pending) — the hook now consumes week-scoped matchups and continues to use the lean player/stat queries.

### 5. Implement Background Prefetching

- [x] Determine “next” week IDs (e.g., upcoming 2 weeks) from navigation state or week metadata.
- [x] In `WeeklySchedule` (or the hook), get `const utils = trpc.useUtils()`.
- [x] Add a `useEffect` that runs after the active week finishes loading:
  - Calls `utils.matchup.getAll.prefetch({ where: { seasonId, weekId } })` for each target week.
  - Prefetches `teamStats.weekly.getByWeek` and `playerStats.weekly.getByWeek` for the same IDs.
  - Includes guards to skip when offline, when prefetch already exists (`utils.invalidate` not needed), or when viewing historical seasons (optional optimization).
- [x] Optionally expose a debug flag/log so we can confirm prefetches fire only once per week — the indicator above the schedule surface now provides visibility when prefetching happens.
> ✅ Step 5 initial prefetch effect is wired up; it tracks deduplication (prefetchedWeekIds), guards offline, runs only for the active season, and exposes a UI indicator while the background workload is running.

### 6. Cache-Aware UI Behavior

- [x] Ensure `WeeklySchedule` reads from React Query cache before showing loading states when users hop to prefetched weeks.
- [x] Add a subtle indicator (spinner or badge) if we want to show that background prefetching is in progress.
- [ ] Validate that navigation to a prefetched week renders instantly; otherwise tap into query options (`staleTime`, `gcTime`) to keep cached data alive.

> The `useWeeklyScheduleData` hook already gates rendering on `ready` so cached data is reused after navigation, and the new indicator shows when prefetching fires.

### 7. Optional Full-Season Mode

- [ ] If the product still needs a “season overview,” create a separate toggle that intentionally loads the heavier season-wide data.
- [ ] Reuse the existing hook path for that mode so code remains DRY.
- [ ] Lazy-load the season view only when the user switches to it.

### 8. Testing & Rollout

- [ ] Add integration tests (or Cypress) that simulate switching weeks and confirm requests fire as expected.
- [ ] Compare Lighthouse or custom Web Vitals before/after to quantify the improvement.
- [ ] Deploy behind a feature flag if desired; monitor latency metrics.

---

## Notes & Risks

- Ensure prefetching doesn’t overwhelm rate limits; cap to a few weeks at a time.
- Guard against stale caches when seasons change (invalidate on season switch).
- Watch for concurrency issues if users switch weeks rapidly before prefetch completes.
