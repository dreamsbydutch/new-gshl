import assert from "node:assert/strict";
import test from "node:test";
import { weeklyCategoryStrength } from "../../runtime/power-category-strength";

void test("an explicit goalie forfeit is worse than any qualified goalie, including an extreme outlier", () => {
  const rows = new Map(
    Array.from({ length: 14 }, (_, i) => [
      String(i),
      {
        GP: 30,
        G: 5,
        W: i === 1 ? 0 : 4,
        GAA: i === 1 ? 10 : 2,
        SVP: i === 1 ? 0.5 : 0.95,
      },
    ]),
  );
  const input: Map<string, Record<string, unknown>> = new Map(rows);
  input.set("0", { GP: 30, G: 5, W: "", GAA: null, SVP: "" });
  const scores = weeklyCategoryStrength(
    input,
    [...input.keys()],
    ["G", "W", "GAA", "SVP"],
  );
  assert.ok(scores.get("0")! < scores.get("1")!);
  assert.deepEqual(
    weeklyCategoryStrength(input, [...input.keys()], ["G"]),
    new Map([...input.keys()].map((id) => [id, 0])),
  );
});

void test("absent data is not a forfeit and lower GAA is better", () => {
  const input = new Map<string, Record<string, unknown>>([
    ["unknown", { GP: 30 }],
    ["good", { GP: 30, GAA: 2 }],
    ["poor", { GP: 30, GAA: 4 }],
  ]);
  const before = structuredClone(input);
  const scores = weeklyCategoryStrength(input, [...input.keys()], ["GAA"]);
  assert.equal(scores.get("unknown"), 0);
  assert.equal(scores.get("good"), 1);
  assert.equal(scores.get("poor"), -1);
  assert.deepEqual(input, before);
});
