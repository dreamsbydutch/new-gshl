import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useScheduleBuilderView } from "../src/hooks/features/useScheduleBuilderView";
import { useScheduleBuilder } from "../src/hooks/main/useScheduleBuilder";

// Keep the real Convex hooks and React lifecycle; replace only the network watches.
function mountBuilder<T>(t: TestContext, useHook: () => T) {
  const client = new ConvexReactClient("https://schedule-test.convex.cloud");
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  const key = (name: string, args: unknown) => JSON.stringify([name, args]);
  t.mock.method(
    client,
    "watchQuery",
    (reference: FunctionReference<"query">, args: unknown) => {
      const id = key(getFunctionName(reference), args);
      return {
        localQueryResult() {
          const value = values.get(id);
          if (value instanceof Error) throw value;
          return value;
        },
        onUpdate(callback: () => void) {
          const callbacks = listeners.get(id) ?? new Set<() => void>();
          callbacks.add(callback);
          listeners.set(id, callbacks);
          return () => {
            callbacks.delete(callback);
            if (!callbacks.size) listeners.delete(id);
          };
        },
      };
    },
  );
  let current!: T;
  let renders = 0;
  function Probe() {
    renders++;
    current = useHook();
    return null;
  }
  const tree = () =>
    createElement(ConvexProvider, { client }, createElement(Probe));
  let renderer: ReactTestRenderer | undefined;
  t.after(async () => {
    act(() => renderer?.unmount());
    await client.close();
  });
  act(() => {
    renderer = create(tree());
  });
  return {
    get current() {
      return current;
    },
    get renders() {
      return renders;
    },
    subscribed(name: string, args: unknown) {
      return listeners.has(key(name, args));
    },
    rerender() {
      act(() => renderer?.update(tree()));
    },
    publish(name: string, args: unknown, value: unknown) {
      act(() => {
        const id = key(name, args);
        values.set(id, value);
        [...(listeners.get(id) ?? [])].forEach((notify) => notify());
      });
    },
  };
}

void test("calendar previews preserve date edits and clear when season or week counts change", (t) => {
  const h = mountBuilder(t, useScheduleBuilderView);
  act(() => h.current.setSeasonId("season"));
  act(() => h.current.setCalendarStart("2090-10-01"));
  act(() => h.current.previewCalendar());
  assert.equal(h.current.calendarRows.length, 24);
  act(() => h.current.editCalendarWeek(0, { gameDays: 5 }));
  h.rerender();
  assert.equal(h.current.calendarRows[0]?.gameDays, 5);
  act(() => h.current.setWeeks(23));
  assert.equal(h.current.calendarRows.length, 0);
  act(() => h.current.previewCalendar());
  assert.equal(h.current.calendarRows.length, 26);
  act(() => h.current.setSeasonId("another-season"));
  assert.equal(h.current.calendarRows.length, 0);
  act(() => h.current.previewCalendar());
  act(() => h.current.setPlayoffWeeks(4));
  assert.equal(h.current.calendarRows.length, 0);
  assert.ok(h.renders < 35);
});

void test("opening schedule builder and editing inputs settles without a render loop", (t) => {
  const h = mountBuilder(t, useScheduleBuilderView);
  assert.equal(h.current.seasonId, "");
  assert.equal(h.current.context, undefined);
  h.publish("schedule:builderSeasons", {}, [{ id: "season", name: "Season" }]);
  h.rerender();
  act(() => h.current.setWeeks(23));
  act(() => h.current.setSeed(2));
  assert.equal(h.current.weeks, 23);
  assert.equal(h.current.seed, 2);
  assert.deepEqual(h.current.seasons, [{ id: "season", name: "Season" }]);
  assert.ok(h.renders < 20, `Expected settled renders, received ${h.renders}`);
});

void test("history subscriptions settle, combine updates, and clear when season changes", (t) => {
  const h = mountBuilder(t, useScheduleBuilderView);
  act(() => h.current.setSeasonId("season"));
  const context = {
    teams: [],
    historySeasonIds: ["old1", "old2"],
    regularWeeks: 21,
    hasSchedule: false,
  };
  h.publish("schedule:builderContext", { seasonId: "season" }, context);
  const first = { seasonId: "season", historySeasonId: "old1" };
  const second = { seasonId: "season", historySeasonId: "old2" };
  h.publish("schedule:builderSeasonHistory", first, {
    history: [{ a: "a", b: "b", games: 3, aHome: 2 }],
    excluded: 0,
  });
  assert.equal(h.current.context, undefined, "Wait for every history batch");
  h.publish("schedule:builderSeasonHistory", second, {
    history: [{ a: "a", b: "b", games: 2, aHome: 1 }],
    excluded: 1,
  });
  assert.deepEqual(h.current.context?.history, [
    { a: "a", b: "b", games: 5, aHome: 3 },
  ]);
  h.rerender();
  h.publish(
    "schedule:builderContext",
    { seasonId: "season" },
    { ...context, hasSchedule: true },
  );
  assert.equal(h.current.context?.hasSchedule, true);
  act(() => h.current.setSeasonId("next"));
  assert.equal(h.current.context, undefined);
  assert.equal(h.subscribed("schedule:builderSeasonHistory", first), false);
  assert.equal(h.subscribed("schedule:builderSeasonHistory", second), false);
  h.publish(
    "schedule:builderContext",
    { seasonId: "next" },
    { ...context, historySeasonIds: [] },
  );
  assert.deepEqual(h.current.context?.history, []);
  assert.ok(h.renders < 40, `Expected settled renders, received ${h.renders}`);
});

void test("history errors stay visible and recover without repeated renders", (t) => {
  const h = mountBuilder(t, useScheduleBuilderView);
  act(() => h.current.setSeasonId("season"));
  h.publish(
    "schedule:builderContext",
    { seasonId: "season" },
    {
      teams: [],
      historySeasonIds: ["old"],
      regularWeeks: 21,
      hasSchedule: false,
    },
  );
  const args = { seasonId: "season", historySeasonId: "old" };
  h.publish(
    "schedule:builderSeasonHistory",
    args,
    new Error("History unavailable"),
  );
  assert.equal(h.current.loadError, "History unavailable");
  assert.equal(h.current.context, undefined);
  h.rerender();
  h.publish("schedule:builderSeasonHistory", args, {
    history: [],
    excluded: 0,
  });
  assert.equal(h.current.loadError, null);
  assert.deepEqual(h.current.context?.history, []);
  assert.ok(h.renders < 30, `Expected settled renders, received ${h.renders}`);
});

void test("the query hook alone settles with no selected season", (t) => {
  const h = mountBuilder(t, () => useScheduleBuilder(""));
  h.rerender();
  assert.equal(h.current.context, undefined);
  assert.equal(h.current.loadError, null);
  assert.ok(h.renders < 10);
});
