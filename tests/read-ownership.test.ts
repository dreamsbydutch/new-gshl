import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useUfaCatalog, useUfaOfferMutation } from "../src/hooks/main/useUfa";
import { useMockDraftPreview } from "../src/hooks/main/useDraftHub";
import { useDraftPickPages } from "../src/hooks/main/useDraftPick";
import { useOwnerRankingsData } from "../src/hooks/features/useOwnerRankingsData";
import { useDraftBoardData } from "../src/hooks/features/useDraftBoardData";
import { HOME_MOCK_DRAFT_PREVIEW_LIMIT } from "../src/lib/utils/features/home-dashboard";
import type { UfaOverviewMode } from "../src/lib/types/ufa";

function mountRead<T>(
  t: TestContext,
  useHook: () => T,
  results = new Map<string, unknown>(),
) {
  const client = new ConvexReactClient("https://read-test.convex.cloud");
  const subscribed = new Map<string, unknown>();
  t.mock.method(
    client,
    "watchQuery",
    (reference: FunctionReference<"query">, args: unknown) => {
      const name = getFunctionName(reference);
      return {
        localQueryResult: () => results.get(name),
        onUpdate: () => {
          subscribed.set(name, args);
          return () => {
            subscribed.delete(name);
          };
        },
      };
    },
  );
  const mutation = t.mock.method(client, "mutation", async () => ({
    saved: true,
  }));
  let current!: T;
  let renderer!: ReactTestRenderer;
  function Probe() {
    current = useHook();
    return null;
  }
  const render = () =>
    createElement(ConvexProvider, { client }, createElement(Probe));
  act(() => {
    renderer = create(render());
  });
  t.after(async () => {
    act(() => renderer.unmount());
    await client.close();
  });
  return {
    get current() {
      return current;
    },
    subscribed,
    mutation,
    rerender() {
      act(() => renderer.update(render()));
    },
  };
}

for (const mode of ["full", "home"] as const) {
  void test(`UFA ${mode} subscribes only to public state and its catalog`, (t) => {
    const h = mountRead(t, () => useUfaCatalog(mode));
    assert.equal(h.current.isLoading, true);
    assert.equal(h.current.catalog, undefined);
    assert.deepEqual([...h.subscribed.keys()].sort(), [
      mode === "full" ? "frontend:ufaCatalog" : "frontend:ufaHomeCatalog",
      "ufa:publicState",
    ]);
    for (const args of h.subscribed.values()) assert.deepEqual(args, {});
  });
}

void test("UFA changes subscriptions when mode changes and recognizes loaded empty catalogs", (t) => {
  const empty = {
    players: [],
    nhlStats: [],
    nhlTeams: [],
    franchises: [],
    teams: [],
    seasons: [],
    contracts: [],
  };
  const state = { groups: [], offers: [], oddsByGroup: {} };
  const results = new Map<string, unknown>([
    ["frontend:ufaCatalog", empty],
    ["ufa:publicState", state],
  ]);
  let mode: UfaOverviewMode = "full";
  const h = mountRead(t, () => useUfaCatalog(mode), results);
  assert.equal(h.current.isLoading, false);
  assert.equal(h.current.catalog, empty);
  assert.equal(h.current.state, state);
  mode = "home";
  h.rerender();
  assert.equal(h.current.isLoading, true);
  assert.equal(h.current.catalog, undefined);
  assert.deepEqual([...h.subscribed.keys()].sort(), [
    "frontend:ufaHomeCatalog",
    "ufa:publicState",
  ]);
});

void test("UFA waits for public state even when the catalog is loaded", (t) => {
  const h = mountRead(
    t,
    () => useUfaCatalog("home"),
    new Map([["frontend:ufaHomeCatalog", { players: [] }]]),
  );
  assert.equal(h.current.isLoading, true);
});

void test("UFA write adapter preserves Candidate 2 transport and callbacks", async (t) => {
  const h = mountRead(t, useUfaOfferMutation);
  const payload = { playerId: "player", contractLength: 2 };
  const successes: unknown[] = [];
  await act(async () => {
    h.current.mutate(payload, { onSuccess: (value) => successes.push(value) });
  });
  const call = h.mutation.mock.calls[0];
  assert.ok(call?.arguments[0]);
  assert.equal(getFunctionName(call.arguments[0]), "ufa:submitOffer");
  assert.deepEqual(call.arguments[1], payload);
  assert.deepEqual(successes, [{ saved: true }]);
  assert.equal(h.current.isPending, false);
  assert.equal(h.current.error, null);
});

void test("mock draft preview skips missing season without claiming to load", (t) => {
  const h = mountRead(t, () => useMockDraftPreview(""));
  assert.equal(h.subscribed.size, 0);
  assert.deepEqual(h.current, {
    isLoading: false,
    nhlTeams: [],
    projectedDraftPicks: [],
  });
});

void test("mock draft preview scopes its loading read by season and home limit", (t) => {
  const h = mountRead(t, () => useMockDraftPreview("season"));
  assert.equal(h.current.isLoading, true);
  assert.deepEqual(h.subscribed.get("frontend:mockDraftPreview"), {
    seasonId: "season",
    take: HOME_MOCK_DRAFT_PREVIEW_LIMIT,
  });
});

void test("mock draft preview distinguishes loaded empty data", (t) => {
  const h = mountRead(
    t,
    () => useMockDraftPreview("season"),
    new Map([
      ["frontend:mockDraftPreview", { nhlTeams: [], projectedDraftPicks: [] }],
    ]),
  );
  assert.equal(h.current.isLoading, false);
  assert.deepEqual(h.current.projectedDraftPicks, []);
});

void test("owner rankings keep loading distinct from the empty fallback", (t) => {
  const h = mountRead(t, useOwnerRankingsData);
  assert.equal(h.current.isLoading, true);
  assert.deepEqual(h.current.data.rankings, []);
  assert.deepEqual([...h.subscribed], [["frontend:ownerRankings", {}]]);
});

void test("owner rankings recognize loaded empty results", (t) => {
  const result = { rankings: [] };
  const h = mountRead(
    t,
    useOwnerRankingsData,
    new Map([["frontend:ownerRankings", result]]),
  );
  assert.equal(h.current.isLoading, false);
  assert.equal(h.current.data, result);
});

void test("draft board remains loading while default empty arrays are unhydrated", (t) => {
  const h = mountRead(t, () => useDraftBoardData({ seasonId: "season" }));
  assert.equal(h.current.isLoading, true);
  assert.equal(h.current.ready, false);
  assert.deepEqual(h.current.draftPlayers, []);
});

void test("draft board recognizes completed empty first pages", (t) => {
  const page = { page: [], isDone: true, continueCursor: "" };
  const results = new Map<string, unknown>([
    ["frontend:playersPage", page],
    ["frontend:draftPicksPage", page],
    ["frontend:contracts", []],
    ["frontend:nhlTeams", []],
    ["frontend:seasons", []],
    ["frontend:teams", []],
  ]);
  const h = mountRead(
    t,
    () => useDraftBoardData({ seasonId: "season" }),
    results,
  );
  assert.equal(h.current.isLoading, false);
  assert.equal(h.current.ready, true);
  assert.equal(h.current.hasMore, false);
});

for (const options of [
  { seasonId: "" },
  { seasonId: "season", enabled: false },
]) {
  void test(`draft pick pagination skips without loading: ${JSON.stringify(options)}`, (t) => {
    const h = mountRead(t, () => useDraftPickPages(options));
    assert.equal(h.current.isLoading, false);
    assert.equal(h.current.isLoadingMore, false);
    assert.equal(h.subscribed.size, 0);
  });
}
