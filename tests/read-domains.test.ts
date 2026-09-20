import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Component, createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import {
  useTeams,
  useNHLTeams,
  useFranchises,
  useTeamDayStats,
  useTeamWeekStats,
  useTeamSeasonStats,
} from "../src/hooks/main/useTeam";
import { usePlayers, usePlayersByIds } from "../src/hooks/main/usePlayer";
import {
  usePlayerStats,
  usePlayerSplitsByTeams,
} from "../src/hooks/main/usePlayerStats";
import { useSeasons } from "../src/hooks/main/useSeason";
import { useSeasonDataBundle } from "../src/hooks/features/useSeasonDataBundle";

function mount<T>(t: TestContext, useHook: () => T) {
  const client = new ConvexReactClient("https://read-test.convex.cloud");
  const values = new Map<string, unknown>();
  const updates = new Set<() => void>();
  const subscriptions = new Set<string>();
  const transport = t.mock.method(
    client,
    "watchQuery",
    (reference: FunctionReference<"query">) => {
      const name = getFunctionName(reference);
      return {
        localQueryResult() {
          const value = values.get(name);
          if (value instanceof Error) throw value;
          return value;
        },
        onUpdate(callback: () => void) {
          subscriptions.add(name);
          updates.add(callback);
          return () => {
            updates.delete(callback);
            subscriptions.delete(name);
          };
        },
      };
    },
  );
  let current!: T;
  let caught: Error | undefined;
  class Boundary extends Component<
    { children?: ReactNode },
    { failed: boolean }
  > {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch(error: Error) {
      caught = error;
    }
    render() {
      return this.state.failed ? null : this.props.children;
    }
  }
  function Probe() {
    current = useHook();
    return null;
  }
  const tree = () =>
    createElement(
      ConvexProvider,
      { client },
      createElement(Boundary, {}, createElement(Probe)),
    );
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(tree());
  });
  t.after(async () => {
    act(() => renderer.unmount());
    await client.close();
  });
  return {
    get current() {
      return current;
    },
    get caught() {
      return caught;
    },
    transport,
    subscriptions,
    rerender() {
      act(() => renderer.update(tree()));
    },
    publish(name: string, value: unknown) {
      act(() => {
        values.set(name, value);
        [...updates].forEach((update) => update());
      });
    },
  };
}

for (const [name, useHook, where] of [
  [
    "teams",
    () => useTeams({ seasonId: "season", conferenceId: "conference" }),
    { seasonId: "season", confId: "conference" },
  ],
  ["nhlTeams", () => useNHLTeams({ isActive: true }), { isActive: true }],
  [
    "franchises",
    () => useFranchises({ ownerId: "owner" }),
    { ownerId: "owner" },
  ],
  [
    "teamDayStats",
    () =>
      useTeamDayStats({
        teamId: "team",
        date: new Date("2026-09-20T00:00:00Z"),
      }),
    { gshlTeamId: "team", date: "2026-09-20" },
  ],
  [
    "teamWeekStats",
    () => useTeamWeekStats({ weekId: "week" }),
    { weekId: "week" },
  ],
  [
    "teamSeasonStats",
    () => useTeamSeasonStats({ seasonId: "season", seasonType: "regular" }),
    { seasonId: "season", seasonType: "regular" },
  ],
] as const) {
  void test(`${name}: stable pending data, filter forwarding and hydrated empty result`, (t) => {
    const h = mount<{ data: unknown[]; isLoading: boolean }>(t, useHook);
    assert.equal(h.current.isLoading, true);
    const pending = h.current.data;
    h.rerender();
    assert.equal(h.current.data, pending);
    assert.deepEqual(h.transport.mock.calls[0]?.arguments[1], { where });
    assert.equal("error" in h.current, false);
    h.publish(`frontend:${name}`, []);
    assert.equal(h.current.isLoading, false);
    assert.deepEqual(h.current.data, []);
  });
}

void test("disabled collections never subscribe or claim loading", (t) => {
  const h = mount(t, () => ({
    teams: useTeams({ enabled: false }),
    players: usePlayers({ enabled: false }),
    seasons: useSeasons({ enabled: false }),
  }));
  assert.equal(h.subscriptions.size, 0);
  for (const result of Object.values(h.current)) {
    assert.equal(result.isLoading, false);
    assert.deepEqual(result.data, []);
    assert.equal("error" in result, false);
    assert.equal("isFetching" in result, false);
  }
});

void test("missing player/stat scope skips reads and loading", (t) => {
  const h = mount(t, () => ({
    players: usePlayersByIds([]),
    stats: usePlayerStats(),
  }));
  assert.equal(h.subscriptions.size, 0);
  assert.equal(h.current.players.isLoading, false);
  assert.deepEqual(h.current.stats.status, { isLoading: false });
  assert.equal(h.current.stats.ready, true);
});

void test("bundle explicitly missing scope stays skipped and season stats use concrete rows", (t) => {
  let scoped = false;
  const h = mount(t, () =>
    useSeasonDataBundle({
      seasonId: scoped ? "season" : null,
      weekId: null,
      includeSeasonStats: true,
      useNavigation: false,
    }),
  );
  assert.equal(h.subscriptions.size, 0);
  assert.equal(h.current.ready, true);
  scoped = true;
  h.rerender();
  assert.equal(h.current.ready, false);
  const rows = [{ id: "stat", gshlTeamId: "team", seasonId: "season" }];
  h.publish("frontend:teamSeasonStats", rows);
  h.publish("frontend:teams", []);
  h.publish("frontend:matchups", []);
  assert.equal(h.current.ready, true);
  assert.equal(h.current.teamStats, rows);
});

void test("read failures reach the existing React error boundary", (t) => {
  t.mock.method(console, "error", () => undefined);
  const h = mount(t, () => useTeams());
  const failure = new Error("read failed");
  h.publish("frontend:teams", failure);
  assert.equal(h.caught, failure);
});

void test("optional split subscriptions retain real returned errors and recover", (t) => {
  const h = mount(t, () => usePlayerSplitsByTeams({ teamIds: ["team"] }));
  const failure = new Error("split unavailable");
  h.publish("frontend:playerSplitStats", failure);
  assert.equal(h.current.error, failure);
  assert.equal(h.caught, undefined);
  h.publish("frontend:playerSplitStats", []);
  assert.equal(h.current.error, null);
  assert.equal(h.current.isLoading, false);
});
