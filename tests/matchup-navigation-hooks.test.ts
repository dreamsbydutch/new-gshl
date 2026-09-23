import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { useMatchupContextNavigation } from "../src/hooks/features/useMatchupContextNavigation";

void test("switches matchup sides without route navigation and preserves URL context", (t) => {
  let search = "side=away&from=schedule&view=team&season=season1&owner=owner1";
  const replacements: string[] = [];
  let routeNavigations = 0;
  const router = {
    back() {
      routeNavigations++;
    },
    forward() {
      routeNavigations++;
    },
    refresh() {
      routeNavigations++;
    },
    hmrRefresh() {
      routeNavigations++;
    },
    push() {
      routeNavigations++;
    },
    prefetch: () => Promise.resolve(),
    replace() {
      routeNavigations++;
    },
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: {
        replaceState(data: unknown, _title: string, href: string) {
          assert.equal(
            data,
            null,
            "let Next preserve its internal history state and notify query subscribers",
          );
          replacements.push(href);
          search = new URL(href, "https://gshl.test").search.slice(1);
        },
      },
    },
  });
  let current!: ReturnType<typeof useMatchupContextNavigation>;
  let renderer: ReactTestRenderer | undefined;
  function Probe() {
    current = useMatchupContextNavigation("season1", "week1");
    return null;
  }
  const tree = () =>
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        PathnameContext.Provider,
        { value: "/matchup/game1" },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams(search) },
          createElement(Probe),
        ),
      ),
    );
  t.after(() => {
    act(() => renderer?.unmount());
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  act(() => {
    renderer = create(tree());
  });
  assert.equal(current.selectedSide, "away");
  for (const side of ["home", "away"] as const) {
    act(() => current.selectSide(side));
    assert.equal(
      routeNavigations,
      0,
      "an in-page team toggle must not start a route transition",
    );
    act(() => renderer?.update(tree()));
    assert.equal(current.selectedSide, side);
    const url = new URL(replacements.at(-1)!, "https://gshl.test");
    assert.equal(url.pathname, "/matchup/game1");
    assert.equal(url.searchParams.get("side"), side);
    assert.equal(url.searchParams.get("owner"), "owner1");
    assert.equal(url.searchParams.get("season"), "season1");
    assert.equal(url.searchParams.get("from"), "schedule");
    assert.equal(url.searchParams.get("view"), "team");
  }
  assert.equal(replacements.length, 2);
});
