import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useNHLSchedule, useNHLStandings } from "../src/hooks/main/useNHL";

function browser(t: TestContext) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const events = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: events,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { visibilityState: "visible" },
  });
  const restore = () => {
    if (windowDescriptor)
      Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (documentDescriptor)
      Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
  };
  t.mock.timers.enable({
    apis: ["Date", "setInterval"],
    now: new Date("2026-09-26T12:00:00Z"),
  });
  return { events, restore };
}

void test("standings reuse cached results on focus and remount, refreshing after one day", async (t) => {
  const { events, restore } = browser(t);
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ standings: [], updatedAt: Date.now() }),
  );
  let latest: ReturnType<typeof useNHLStandings> | undefined;
  function Probe() {
    latest = useNHLStandings();
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  t.after(() => {
    act(() => renderer?.unmount());
    restore();
  });
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  const originalTimestamp = latest?.data?.updatedAt;
  await act(async () => {
    events.dispatchEvent(new Event("focus"));
  });
  act(() => renderer?.unmount());
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  await act(async () => {
    t.mock.timers.tick(15 * 60 * 1000);
  });
  assert.equal(request.mock.callCount(), 1);
  assert.equal(latest?.data?.updatedAt, originalTimestamp);
  await act(async () => {
    t.mock.timers.tick((24 * 60 - 15) * 60 * 1000);
  });
  assert.equal(request.mock.callCount(), 2);
  assert.notEqual(latest?.data?.updatedAt, originalTimestamp);
});

void test("schedule waits 15 minutes between refreshes and keeps the last timestamp on failure", async (t) => {
  const { events, restore } = browser(t);
  let fail = false;
  const request = t.mock.method(globalThis, "fetch", async () =>
    fail
      ? new Response(null, { status: 502 })
      : Response.json({ gameWeek: [], updatedAt: Date.now() }),
  );
  let latest: ReturnType<typeof useNHLSchedule> | undefined;
  function Probe() {
    latest = useNHLSchedule("2026-01-05", "2026-01-11");
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  t.after(() => {
    act(() => renderer?.unmount());
    restore();
  });
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  const originalTimestamp = latest?.data?.updatedAt;
  await act(async () => {
    t.mock.timers.tick(14 * 60 * 1000);
    events.dispatchEvent(new Event("focus"));
  });
  assert.equal(request.mock.callCount(), 1);
  await act(async () => {
    t.mock.timers.tick(60 * 1000);
  });
  assert.equal(request.mock.callCount(), 2);
  assert.notEqual(latest?.data?.updatedAt, originalTimestamp);
  const lastSuccess = latest?.data?.updatedAt;
  fail = true;
  await act(async () => {
    t.mock.timers.tick(15 * 60 * 1000);
  });
  assert.equal(request.mock.callCount(), 3);
  assert.equal(latest?.data?.updatedAt, lastSuccess);
  assert.ok(latest?.error);
  await act(async () => {
    events.dispatchEvent(new Event("focus"));
  });
  assert.equal(request.mock.callCount(), 3);
});
