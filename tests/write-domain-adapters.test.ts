import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { api } from "../convex/_generated/api";
import { useDomainMutation } from "../src/hooks/main/useDomainMutation";
import { useDraftCorrections } from "../src/hooks/main/useDraftCorrections";
import { useWeeklyEditionNewsroom } from "../src/hooks/main/useWeeklyEditions";
import type { DomainDraftCorrectionArgs } from "../src/lib/types/draft-corrections";

function mount<T>(t: TestContext, useHook: () => T) {
  const client = new ConvexReactClient("https://write-test.convex.cloud");
  const response = { saved: true };
  const transport = t.mock.method(client, "mutation", async () => response);
  t.mock.method(client, "watchQuery", () => ({
    localQueryResult: () => undefined,
    onUpdate: () => () => undefined,
  }));
  let current!: T;
  let renderer!: ReactTestRenderer;
  function Probe() {
    current = useHook();
    return null;
  }
  act(() => {
    renderer = create(
      createElement(ConvexProvider, { client }, createElement(Probe)),
    );
  });
  t.after(async () => {
    act(() => renderer.unmount());
    await client.close();
  });
  return {
    get current() {
      return current;
    },
    transport,
    response,
  };
}

void test("domain mutation maps inputs and preserves async result and callback identity", async (t) => {
  const reference = makeFunctionReference<
    "mutation",
    { count: number },
    { saved: boolean }
  >("test:domain");
  const h = mount(t, () =>
    useDomainMutation(reference, (args: { text: string }) => ({
      count: Number(args.text),
    })),
  );
  await act(async () => {
    assert.equal(await h.current.mutateAsync({ text: "4" }), h.response);
  });
  assert.deepEqual(h.transport.mock.calls[0]?.arguments.slice(0, 2), [
    reference,
    { count: 4 },
  ]);
  const seen: unknown[] = [];
  await act(async () => {
    h.current.mutate(
      { text: "8" },
      {
        onSuccess: (result) => seen.push(result),
        onSettled: () => seen.push("settled"),
      },
    );
  });
  assert.deepEqual(seen, [h.response, "settled"]);
  assert.deepEqual(h.transport.mock.calls[1]?.arguments[1], { count: 8 });
});

function correction(gshlTeamId: string | null): DomainDraftCorrectionArgs {
  return {
    seasonId: "season",
    reason: "Correct draft record",
    edits: [
      {
        pickId: "pick",
        expectedVersion: "original-version",
        changes: {
          gshlTeamId,
          originalTeamId: null,
          playerId: "player",
          round: 2,
          pick: 14,
          isTraded: true,
          isSigning: false,
        },
      },
    ],
  };
}

void test("draft correction adapter preserves nested values and leaves its input unchanged", async (t) => {
  const h = mount(t, () => useDraftCorrections(""));
  const input = correction("team");
  const snapshot = structuredClone(input);
  await act(async () => {
    await h.current.mutateAsync(input);
  });
  assert.equal(
    getFunctionName(h.transport.mock.calls[0]!.arguments[0]),
    getFunctionName(api.draft.correctPicks),
  );
  assert.deepEqual(h.transport.mock.calls[0]?.arguments[1], snapshot);
  assert.deepEqual(input, snapshot);
});

void test("invalid draft assignment rejects through the lifecycle and invokes callbacks once", async (t) => {
  const h = mount(t, () => useDraftCorrections(""));
  let rejected!: Promise<unknown>;
  act(() => {
    rejected = h.current.mutateAsync(correction(null));
  });
  assert.equal(h.current.isPending, true);
  await act(async () => {
    await assert.rejects(rejected, /team must be assigned/);
  });
  assert.equal(h.transport.mock.callCount(), 0);
  assert.match(h.current.error?.message ?? "", /team must be assigned/);
  assert.equal(h.current.isPending, false);
  const seen: string[] = [];
  await act(async () => {
    h.current.mutate(correction(null), {
      onSuccess: () => seen.push("unexpected success"),
      onError: (error) => seen.push(error.message),
      onSettled: () => seen.push("settled"),
    });
  });
  assert.deepEqual(seen, [
    "A team must be assigned to each draft pick",
    "settled",
  ]);
  await act(async () => {
    await h.current.mutateAsync(correction("team"));
  });
  assert.equal(h.current.error, null);
  assert.equal(h.current.isPending, false);
  assert.equal(h.transport.mock.callCount(), 1);
});

void test("newsroom optional home edition preserves omission and explicit IDs", async (t) => {
  const h = mount(t, () => useWeeklyEditionNewsroom());
  await act(async () => {
    await h.current.setHomeActive.mutateAsync({});
  });
  assert.equal(
    getFunctionName(h.transport.mock.calls[0]!.arguments[0]),
    getFunctionName(api.weeklyEditions.setHomeActive),
  );
  assert.deepEqual(h.transport.mock.calls[0]?.arguments[1], {});
  await act(async () => {
    await h.current.setHomeActive.mutateAsync({ editionId: "edition" });
  });
  assert.deepEqual(h.transport.mock.calls[1]?.arguments[1], {
    editionId: "edition",
  });
});
