import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { usePowerRankingsPreview } from "./usePowerRankings";

void test("rankings query failure stays local and recovers for both homepage consumers", () => {
  const failure = new Error(
    "[CONVEX Q(frontend:powerRankingsPreview)] Server Error",
  );
  let result: unknown = failure;
  const listeners = new Set<() => void>();
  const client = {
    watchQuery: () => ({
      localQueryResult: () => {
        if (result instanceof Error) throw result;
        return result;
      },
      onUpdate: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      journal: () => undefined,
    }),
  } as unknown as ConvexReactClient;
  const states: ReturnType<typeof usePowerRankingsPreview>[] = [];
  function Consumer() {
    states.push(usePowerRankingsPreview("season"));
    return createElement("div", null, "Homepage still available");
  }
  let root: ReturnType<typeof create>;
  act(() => {
    root = create(
      createElement(ConvexProvider, { client }, [
        createElement(Consumer, { key: "scoreboard" }),
        createElement(Consumer, { key: "rankings" }),
      ]),
    );
  });
  assert.equal(root!.root.findAllByType("div").length, 2);
  assert.equal(states.at(-1)?.error, failure);
  assert.equal(states.at(-1)?.data, undefined);
  assert.equal(states.at(-1)?.isLoading, false);
  result = null;
  act(() => {
    for (const listener of listeners) listener();
  });
  assert.equal(states.at(-1)?.error, null);
  assert.equal(states.at(-1)?.data, null);
  act(() => root!.unmount());
});

