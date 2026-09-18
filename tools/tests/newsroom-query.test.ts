import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { useWeeklyEditionNewsroom } from "../../src/hooks/main/useWeeklyEditions";

function renderNewsroom(aiResult: unknown, newsroomError?: Error) {
  const client = new ConvexReactClient("https://example.convex.cloud");
  mock.method(
    client,
    "watchQuery",
    (query: Parameters<typeof getFunctionName>[0]) => ({
      onUpdate: () => () => {},
      localQueryResult: () => {
        if (getFunctionName(query) === "weeklyEditions:aiStatus") {
          if (aiResult instanceof Error) throw aiResult;
          return aiResult;
        }
        if (newsroomError) throw newsroomError;
        return [];
      },
      journal: () => undefined,
    }),
  );
  let result: ReturnType<typeof useWeeklyEditionNewsroom> | undefined;
  function Probe() {
    result = useWeeklyEditionNewsroom();
    return createElement("p", null, "Editor available");
  }
  const html = renderToStaticMarkup(
    createElement(ConvexProvider, { client }, createElement(Probe)),
  );
  assert.match(html, /Editor available/);
  assert.ok(result);
  return result;
}

test("missing optional AI endpoint does not crash the newsroom", () => {
  const result = renderNewsroom(
    new Error("Could not find public function for 'weeklyEditions:aiStatus'."),
  );
  assert.equal(result.aiStatus, undefined);
  assert.equal(result.isAiStatusLoading, false);
  assert.equal(result.isAiStatusUnavailable, true);
  assert.deepEqual(result.editions, []);
});

test("AI status distinguishes loading, unconfigured, and ready", () => {
  assert.equal(renderNewsroom(undefined).isAiStatusLoading, true);
  for (const configured of [false, true]) {
    const result = renderNewsroom({ configured, model: "test-model" });
    assert.equal(result.aiStatus?.configured, configured);
    assert.equal(result.isAiStatusLoading, false);
    assert.equal(result.isAiStatusUnavailable, false);
  }
});

test("required newsroom query failures are not hidden", () => {
  assert.throws(
    () => renderNewsroom(undefined, new Error("Unauthenticated")),
    /Unauthenticated/,
  );
});
