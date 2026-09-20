import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useAppMutation } from "../src/hooks/main/useAppMutation";
import { useAppAction } from "../src/hooks/main/useAppAction";

type Args = { value: number };
type Result = { saved: number };
const mutation = makeFunctionReference<"mutation", Args, Result>("test:write");
const action = makeFunctionReference<"action", Args, Result>("test:action");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mountWrite<T>(
  t: TestContext,
  method: "mutation" | "action",
  useHook: () => T,
) {
  // A real provider and adapter, with only the transport method replaced.
  // Neither method reaches Convex or opens a network connection.
  const client = new ConvexReactClient("https://write-test.convex.cloud");
  const calls: Array<ReturnType<typeof deferred<Result>>> = [];
  const transport = t.mock.method(client, method, () => {
    const call = deferred<Result>();
    calls.push(call);
    return call.promise;
  });
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
    calls,
    transport,
  };
}

for (const kind of ["mutation", "action"] as const) {
  const useHook =
    kind === "mutation"
      ? () => useAppMutation(mutation)
      : () => useAppAction(action);

  void test(`${kind}: forwards arguments and returns the transport result`, async (t) => {
    const h = mountWrite(t, kind, useHook);
    assert.equal(h.current.isPending, false);
    assert.equal(h.current.error, null);
    let result!: Promise<Result>;
    act(() => {
      result = h.current.mutateAsync({ value: 7 });
    });
    assert.equal(h.current.isPending, true);
    assert.deepEqual(h.transport.mock.calls[0]?.arguments.slice(0, 2), [
      kind === "mutation" ? mutation : action,
      { value: 7 },
    ]);
    const saved = { saved: 7 };
    await act(async () => {
      h.calls[0]!.resolve(saved);
      assert.equal(await result, saved);
    });
    assert.equal(h.current.isPending, false);
    assert.equal(h.current.error, null);
  });

  for (const rejection of [new Error("denied"), "not an Error"]) {
    void test(`${kind}: normalizes ${typeof rejection} rejection and clears it on retry`, async (t) => {
      const h = mountWrite(t, kind, useHook);
      let result!: Promise<Result>;
      act(() => {
        result = h.current.mutateAsync({ value: 1 });
      });
      let caught!: Error;
      const checked = assert.rejects(result, (error: unknown) => {
        assert.ok(error instanceof Error);
        if (rejection instanceof Error) assert.equal(error, rejection);
        else assert.equal(error.message, rejection);
        caught = error;
        return true;
      });
      await act(async () => {
        h.calls[0]!.reject(rejection);
        await checked;
      });
      assert.equal(h.current.error, caught);
      assert.equal(h.current.isPending, false);
      act(() => {
        result = h.current.mutateAsync({ value: 2 });
      });
      assert.equal(h.current.error, null);
      assert.equal(h.current.isPending, true);
      await act(async () => {
        h.calls[1]!.resolve({ saved: 2 });
        assert.deepEqual(await result, { saved: 2 });
      });
      assert.equal(h.current.isPending, false);
      assert.equal(h.current.error, null);
    });
  }

  for (const firstToSettle of [0, 1] as const) {
    for (const latestFails of [false, true]) {
      void test(`${kind}: call ${firstToSettle + 1} settles first, latest ${latestFails ? "fails" : "succeeds"}`, async (t) => {
        const h = mountWrite(t, kind, useHook);
        const olderError = new Error("older");
        const latestError = new Error("latest");
        let older!: Promise<Result>;
        let latest!: Promise<Result>;
        act(() => {
          older = h.current.mutateAsync({ value: 1 });
        });
        act(() => {
          latest = h.current.mutateAsync({ value: 2 });
        });
        const olderChecked = assert.rejects(
          older,
          (error) => error === olderError,
        );
        const latestChecked = latestFails
          ? assert.rejects(latest, (error) => error === latestError)
          : latest.then((result) => {
              assert.deepEqual(result, { saved: 2 });
            });
        const settle = async (index: number) => {
          if (index === 0) {
            h.calls[0]!.reject(olderError);
            await olderChecked;
          } else {
            if (latestFails) h.calls[1]!.reject(latestError);
            else h.calls[1]!.resolve({ saved: 2 });
            await latestChecked;
          }
        };
        await act(async () => {
          await settle(firstToSettle);
        });
        assert.equal(
          h.current.isPending,
          true,
          "the other write is still unsettled",
        );
        assert.equal(
          h.current.error,
          firstToSettle === 1 && latestFails ? latestError : null,
        );
        await act(async () => {
          await settle(1 - firstToSettle);
        });
        assert.equal(h.current.isPending, false);
        assert.equal(h.current.error, latestFails ? latestError : null);
      });
    }
  }
}

void test("mutation: overlapping callback calls each notify and settle once", async (t) => {
  const h = mountWrite(t, "mutation", () => useAppMutation(mutation));
  const events: unknown[] = [];
  act(() => {
    h.current.mutate(
      { value: 1 },
      {
        onSuccess: (result) => {
          events.push(["first success", result]);
        },
        onError: (error) => {
          events.push(["first error", error]);
        },
        onSettled: () => {
          events.push("first settled");
        },
      },
    );
    h.current.mutate(
      { value: 2 },
      {
        onSuccess: (result) => {
          events.push(["second success", result]);
        },
        onError: (error) => {
          events.push(["second error", error]);
        },
        onSettled: () => {
          events.push("second settled");
        },
      },
    );
  });
  const failure = new Error("second failed");
  await act(async () => {
    h.calls[1]!.reject(failure);
  });
  assert.equal(h.current.isPending, true);
  await act(async () => {
    h.calls[0]!.resolve({ saved: 1 });
  });
  assert.deepEqual(events, [
    ["second error", failure],
    "second settled",
    ["first success", { saved: 1 }],
    "first settled",
  ]);
  assert.equal(h.current.error, failure);
  assert.equal(h.current.isPending, false);
});

void test("mutation: success callback exceptions reach onError then onSettled without changing transport state", async (t) => {
  const h = mountWrite(t, "mutation", () => useAppMutation(mutation));
  const callbackError = new Error("callback failed");
  const events: unknown[] = [];
  act(() => {
    h.current.mutate(
      { value: 1 },
      {
        onSuccess: () => {
          events.push("success");
          throw callbackError;
        },
        onError: (error) => {
          events.push(error);
        },
        onSettled: () => {
          events.push("settled");
        },
      },
    );
  });
  await act(async () => {
    h.calls[0]!.resolve({ saved: 1 });
  });
  assert.deepEqual(events, ["success", callbackError, "settled"]);
  assert.equal(h.current.error, null);
  assert.equal(h.current.isPending, false);
});
